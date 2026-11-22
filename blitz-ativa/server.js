import http from 'node:http';
import {timingSafeEqual} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {config} from './config.js';
import {Store} from './store.js';
import {run} from './runner.js';

export function createApp({store, token, execute = run}) {
  if (typeof token !== 'string' || token.length < 32) throw Error('Configure BLITZ_ATIVA_TOKEN com pelo menos 32 caracteres.');
  const secret = Buffer.from(`Bearer ${token}`);
  const json = (response, status, data) => {
    response.writeHead(status, {'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store',
      'X-Content-Type-Options':'nosniff'});
    response.end(JSON.stringify(data));
  };
  let busy = false, closing = false;
  async function tick() {
    if (busy || closing) return;
    const job = store.claim();
    if (!job) return;
    busy = true;
    const heartbeat = setInterval(() => store.heartbeat(job), 10000);
    try {
      const output = await execute(job.input);
      store.finish(job, output.records, output.report, '', output.documents || []);
    } catch (error) {
      try {store.finish(job, [], {state:'failed'}, error.message);} catch { /* A newer lease owns this execution. */ }
    } finally {clearInterval(heartbeat); busy = false;}
  }
  const timer = setInterval(() => {tick().catch(error => console.error('Falha da fila:', error.message));}, 1000);
  const server = http.createServer(async (request, response) => {
    try {
      if (request.url === '/health' && request.method === 'GET') return json(response, 200, {service:'blitz-ativa', version:'0.2.0'});
      const received = Buffer.from(request.headers.authorization || '');
      if (received.length !== secret.length || !timingSafeEqual(received, secret)) return json(response, 401, {error:'Não autorizado.'});
      const userId = String(request.headers['x-blitz-user'] || 'local');
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(userId)) return json(response, 400, {error:'Conta inválida.'});
      if (request.method === 'GET' && request.url === '/v1/jobs') return json(response, 200, {jobs:store.list(userId)});
      if (request.method === 'GET' && request.url === '/v1/sources')
        return json(response, 200, {sources:store.sources(userId), indexedDocuments:store.indexCount(userId)});
      if (request.method === 'POST' && request.url === '/v1/sources') {
        const chunks = [];
        let bytes = 0;
        for await (const chunk of request) {
          bytes += chunk.length;
          if (bytes > 10000) return json(response, 413, {error:'Fonte excede 10 KB.'});
          chunks.push(chunk);
        }
        try {return json(response, 200, {sources:store.addSource(userId, JSON.parse(Buffer.concat(chunks).toString('utf8')))});}
        catch (error) {return json(response, 400, {error:error.message});}
      }
      if (request.method === 'POST' && request.url === '/v1/jobs') {
        if (!/^application\/json\b/i.test(request.headers['content-type'] || '')) return json(response, 415, {error:'Use application/json.'});
        if (store.countPending() >= 10) return json(response, 429, {error:'Fila cheia. Aguarde as execuções pendentes.'});
        const chunks = [];
        let bytes = 0;
        for await (const chunk of request) {
          bytes += chunk.length;
          if (bytes > 32768) return json(response, 413, {error:'Corpo excede 32 KB.'});
          chunks.push(chunk);
        }
        let input, requestKey;
        try {
          const submitted = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          requestKey = submitted.requestKey ?? null;
          if (requestKey !== null && (typeof requestKey !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(requestKey))) throw Error('Chave de repetição inválida.');
          input = config(submitted);
        } catch (error) {
          return json(response, 400, {error:error.message});
        }
        input.sources = [...new Set([...input.sources, ...store.discover(userId, input.query)])].slice(0, 20);
        const job = store.create(input, userId, requestKey);
        json(response, 202, {id:job.id, status:job.status, statusPath:`/v1/jobs/${job.id}`});
        return;
      }
      const match = /^\/v1\/jobs\/([a-f\d-]{36})$/.exec(request.url || '');
      if (request.method === 'GET' && match) {
        const job = store.get(match[1], userId);
        return json(response, job ? 200 : 404, job || {error:'Execução inexistente.'});
      }
      return json(response, 404, {error:'Rota inexistente.'});
    } catch {if (!response.headersSent) json(response, 500, {error:'Falha interna. Consulte o operador.'});}
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.on('close', () => {closing = true; clearInterval(timer);});
  return {server, tick, async stop() {
    closing = true;
    clearInterval(timer);
    await new Promise(resolve => server.close(resolve));
    // Allow the current job to commit its report before closing SQLite.
    while (busy) await new Promise(resolve => setTimeout(resolve, 100));
  }};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.env.NODE_ENV === 'production' && !process.env.BLITZ_ATIVA_DB)
    throw Error('Configure BLITZ_ATIVA_DB em armazenamento persistente para produção.');
  const store = new Store(process.env.BLITZ_ATIVA_DB || 'blitz-ativa/data/blitz.sqlite');
  const app = createApp({store, token:process.env.BLITZ_ATIVA_TOKEN});
  const host = process.env.BLITZ_ATIVA_HOST || '127.0.0.1';
  const port = Number(process.env.PORT || process.env.BLITZ_ATIVA_PORT || 9090);
  app.server.listen(port, host, () => console.info(`Blitz Ativa em http://${host}:${port}`));
  let stopping = false;
  const shutdown = async () => {if (stopping) return; stopping = true; await app.stop(); store.close();};
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
