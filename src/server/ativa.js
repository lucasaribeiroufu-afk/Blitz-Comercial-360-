import {SearchError} from './verifiedSearch.js';
import {mutateCrm} from './crm.js';
import {createHash} from 'node:crypto';

export function quotaExhausted(reports = []) {
  const text = reports.flatMap(report => [...(report.errors || []), ...(report.limits || [])]).join(' ');
  return /orçamento diário esgotado|limite diário de consultas Serper atingido|limite de uso informado pelo Apify insuficiente|HTTP 402|(?:credits?|créditos|quota).{0,50}(?:exhaust|exceed|esgotad|insuficient)/i.test(text);
}

export async function ativaRequest(path, userId, payload, deps = {}) {
  const endpoint = deps.ativaUrl ?? process.env.BLITZ_ATIVA_URL;
  const token = deps.ativaToken ?? process.env.BLITZ_ATIVA_TOKEN;
  if (!endpoint || !token) throw new SearchError('Blitz Ativa ainda não configurado no servidor.', 503);
  let origin;
  try {origin = new URL(endpoint);} catch {throw new SearchError('BLITZ_ATIVA_URL inválida.', 503);}
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash)
    throw new SearchError('BLITZ_ATIVA_URL deve ser uma origem HTTPS.', 503);
  const response = await (deps.ativaFetcher || fetch)(new URL(path, origin), {
    method:payload === undefined ? 'GET' : 'POST', redirect:'error',
    headers:{Authorization:`Bearer ${token}`, 'X-Blitz-User':createHash('sha256').update(userId).digest('hex'), 'Content-Type':'application/json'},
    body:payload === undefined ? undefined : JSON.stringify(payload), signal:AbortSignal.timeout(12000),
  });
  let text = '', bytes = 0;
  const decoder = new TextDecoder();
  if (response.body?.getReader) {
    const reader = response.body.getReader();
    try {
      while (true) {
        const {value, done} = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 3000000) {await reader.cancel(); throw new SearchError('Resposta do Blitz Ativa excede 3 MB.', 502);}
        text += decoder.decode(value, {stream:true});
      }
      text += decoder.decode();
    } finally {reader.releaseLock();}
  } else text = JSON.stringify(await response.json());
  let data;
  try {data = JSON.parse(text);} catch {throw new SearchError('Resposta inválida do Blitz Ativa.', 502);}
  if (!response.ok) throw new SearchError(data.error || `Blitz Ativa HTTP ${response.status}`, response.status);
  return data;
}

export async function ativaAction(body, deps = {}) {
  if (!deps.userId) throw new SearchError('Login obrigatório.', 401);
  const call = (path, payload) => ativaRequest(path, deps.userId, payload, deps);
  if (body.action === 'status') return {configured:!!(process.env.BLITZ_ATIVA_URL && process.env.BLITZ_ATIVA_TOKEN)};
  if (body.action === 'list') return call('/v1/jobs');
  if (body.action === 'sources') return call('/v1/sources');
  if (body.action === 'addSource') return call('/v1/sources', body.source);
  if (body.action === 'start') return call('/v1/jobs', {
    query:body.query, location:body.location, audience:body.audience, alternatives:body.alternatives, sources:body.sources || [], pncp:body.pncp !== false,
    maxPages:20, maxDepth:2, maxAgeDays:30, pncpPages:2,
    requestKey:body.requestKey,
  });
  if (!/^[a-f\d-]{36}$/.test(body.id || '')) throw new SearchError('Execução inválida.', 400);
  const job = await call(`/v1/jobs/${body.id}`);
  if (body.action === 'get') return job;
  if (body.action === 'saveToCrm') {
    if (job.status !== 'finished') throw new SearchError('Aguarde a conclusão da coleta.', 409);
    if (!Array.isArray(body.keys) || !body.keys.length || body.keys.length > 100)
      throw new SearchError('Selecione até 100 registros.', 400);
    const wanted = new Set(body.keys);
    const contacts = (job.records || []).filter(record => wanted.has(record.key)
      && ['potential_company','purchase_mention'].includes(record.recordType));
    if (contacts.length !== wanted.size) throw new SearchError('Registro indisponível ou com região pendente.', 400);
    return (deps.saveCrm || mutateCrm)({action:'saveContacts', contacts}, {userId:deps.userId});
  }
  throw new SearchError('Operação Blitz Ativa inválida.', 400);
}

export async function attachAtivaFallback(result, body, deps = {}) {
  const report = result.meta?.executionReport;
  if (result.ativaJob || (!quotaExhausted(report?.sources) && !deps.startAtiva && !process.env.BLITZ_ATIVA_URL)) return result;
  const source = {source:'Blitz Ativa · coleta própria', kind:'content', consulted:false,
    status:'blocked', received:0, qualified:0, errors:[], limits:[], providerCostUsd:0,
    discarded:{produto:0,vendedor:0,intencao_ausente:0,regiao_desconhecida:0,
      regiao_divergente:0,duplicidade:0,data:0,autor_ausente:0,fonte_invalida:0}};
  try {
    if (!deps.userId) throw Error('Sessão necessária para iniciar a alternativa.');
    const job = await (deps.startAtiva || ativaAction)({action:'start', query:body.query,
      location:body.location, audience:body.audience || ((body.publicB2C || body.intent === 'b2c_consumer' || body.targetEntityType === 'pf') ? 'b2c' : body.intent === 'hybrid' ? 'both' : 'b2b'), sources:body.sourceUrls || [], pncp:true,
      requestKey:deps.ativaRequestKey ? `${deps.ativaRequestKey}-${Math.floor(Date.now()/900000)}` : undefined}, deps);
    result.ativaJob = {id:job.id};
    source.consulted = true; source.status = 'running';
    source.limits.push('Fila própria independente do limite financeiro dos provedores pagos.');
    result.meta.summary = 'Blitz Ativa iniciou a coleta nas fontes próprias.';
    report.state = 'running'; report.summary = result.meta.summary;
  } catch (error) {source.errors.push(error.message);}
  report.sources.push(source);
  return result;
}
