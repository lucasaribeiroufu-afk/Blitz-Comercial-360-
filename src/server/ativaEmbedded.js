import {randomUUID, createHash} from 'node:crypto';
import {getServerFirestore} from './radarStore.js';
import {config, canonicalUrl} from '../../blitz-ativa/config.js';
import {crawl} from '../../blitz-ativa/crawler.js';
import {rawRead} from '../../blitz-ativa/http.js';
import {discover} from '../../blitz-ativa/discovery.js';
import {normalize, SearchError} from './verifiedSearch.js';

const clean = value => JSON.parse(JSON.stringify(value));
export async function embeddedRequest(path, userId, payload, deps = {}) {
  const db = deps.ativaDb || getServerFirestore();
  const root = db.collection('users').doc(userId);
  const jobs = root.collection('ativaJobs');
  const catalog = root.collection('ativaConfig').doc('catalog');
  if (path === '/v1/sources') {
    const current = (await catalog.get()).data()?.sources || [];
    if (!payload) return {sources:current,indexedDocuments:0};
    const source = {url:canonicalUrl(payload.url),label:String(payload.label || '').trim(),keywords:String(payload.keywords || '').trim()};
    if (!source.label || source.label.length > 120 || source.keywords.length > 500) throw new SearchError('Fonte inválida.',400);
    return db.runTransaction(async transaction => {
      const sources = (await transaction.get(catalog)).data()?.sources || [];
      const next = sources.filter(item=>item.url !== source.url);
      if (next.length >= 200) throw new SearchError('Limite de 200 fontes.',400);
      next.push(source);transaction.set(catalog,{sources:next});return {sources:next};
    });
  }
  if (path === '/v1/jobs' && !payload) {
    const snapshot = await jobs.orderBy('createdAt','desc').limit(30).get();
    return {jobs:snapshot.docs.map(doc=>{const {id,input,status,createdAt} = doc.data();return {id,input,status,createdAt};})};
  }
  const match = /^\/v1\/jobs\/([a-f\d-]{36})$/.exec(path);
  if (match) {
    const job = (await jobs.doc(match[1]).get()).data();
    if (!job) throw new SearchError('Execução inexistente.',404);
    return job;
  }
  if (path !== '/v1/jobs' || !payload) throw new SearchError('Operação inválida.',400);
  if (payload.requestKey !== undefined && !/^[A-Za-z0-9_-]{1,128}$/.test(payload.requestKey)) throw new SearchError('Chave de repetição inválida.',400);
  const sources = (await catalog.get()).data()?.sources || [];
  const terms = normalize(payload.query).split(' ').filter(word=>word.length > 2);
  const selected = sources.filter(source=>terms.some(term=>normalize(source.keywords).includes(term))).map(source=>source.url);
  const input = config({...payload,pncp:true,discover:payload.discover ?? !(payload.sources || []).length,sources:[...new Set([...(payload.sources || []),...selected])].slice(0,20)});
  const id = payload.requestKey ? createHash('sha256').update(payload.requestKey).digest('hex').replace(/^(.{8})(.{4})(.{4})(.{4})(.{12}).*$/,'$1-$2-$3-$4-$5') : randomUUID();
  const ref = jobs.doc(id);
  const now = Date.now();
  const job = {id,input,status:'running',createdAt:new Date(now).toISOString(),leaseUntil:now+60000,records:[],report:null};
  const existing = await db.runTransaction(async transaction => {
    const previous = (await transaction.get(ref)).data();
    if (previous && (previous.status === 'finished' || previous.leaseUntil > now)) return previous;
    transaction.set(ref,clean(job));return null;
  });
  if (existing) return existing;
  try {
    const deadline = Math.min(Date.now()+40000,deps.deadline || Infinity);
    const discovery = input.discover ? await (deps.ativaDiscover || discover)(input,{
      deadline:Math.min(deadline-10000,Date.now()+22000),read:deps.ativaRead || rawRead,authToken:deps.authToken,
    }) : {sources:[],candidates:[],reports:[]};
    const collectedSources = [...new Set([...input.sources,...discovery.sources])].slice(0,20);
    const output = await (deps.ativaCrawl || crawl)({...input,sources:collectedSources,maxPages:12,maxDepth:1}, {
      deadline, read:url=>rawRead(url,{timeout:Math.max(1,Math.min(6000,deadline-Date.now()))})
    });
    const reports = [...discovery.reports,...output.pages];
    const limited = output.limited || reports.some(page=>page.status !== 'collected');
    job.status = 'finished';job.records = output.records.slice(0,50);
    job.report = {state:output.pages.some(page=>page.status==='collected') ? limited ? 'partial' : 'complete' : 'unavailable',
      discovery,reports,paidProviderCalls:0,generatedAt:new Date().toISOString(),
      coverage:'Descoberta por produto e coleta própria de até 12 páginas e 50 registros dentro da janela de 40 segundos. Cobertura sujeita ao índice, quotas e acesso público das fontes.'};
    const observed = output.pages.filter(page=>page.status === 'collected').map(page=>page.url);
    if (observed.length) await db.runTransaction(async transaction=>{
      const current = (await transaction.get(catalog)).data()?.sources || [];
      const known = new Set(current.map(source=>source.url));
      const additions = observed.filter(url=>!known.has(url)).map(url=>({url,label:new URL(url).hostname,
        keywords:input.query,discoveredAt:new Date().toISOString()}));
      transaction.set(catalog,{sources:[...current,...additions].slice(0,200)});
    });
  } catch (error) {job.status='failed';job.error=error.message;}
  await ref.set(clean(job));return clean(job);
}
