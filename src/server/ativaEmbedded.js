import {randomUUID, createHash} from 'node:crypto';
import {getServerFirestore} from './radarStore.js';
import {config, canonicalUrl} from '../../blitz-ativa/config.js';
import {collectAtivaBatch} from './ativaBatch.js';
import {normalize, SearchError} from './verifiedSearch.js';

const clean = value => JSON.parse(JSON.stringify(value));
export async function embeddedRequest(path, userId, payload, deps = {}) {
  const db = deps.ativaDb || getServerFirestore();
  const root = db.collection('users').doc(userId);
  const jobs = root.collection('ativaJobs');
  const catalog = root.collection('ativaConfig').doc('catalog');
  if (path === '/v1/sources') {
    const current = (await catalog.get()).data()?.sources || [];
    if (!payload) return {sources:current.filter(source=>!source.discoveredAt || source.verifiedProductContext),indexedDocuments:0};
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
  const match = /^\/v1\/jobs\/([a-f\d-]{36})(\/continue)?$/.exec(path);
  let id, input;
  if (match) {
    const previous = (await jobs.doc(match[1]).get()).data();
    if (!previous) throw new SearchError('Execução inexistente.',404);
    if (!match[2]) return previous;
    if (!payload) throw new SearchError('Retomada exige POST.',405);
    id = previous.id; input = previous.input;
  } else {
    if (path !== '/v1/jobs' || !payload) throw new SearchError('Operação inválida.',400);
    if (payload.requestKey !== undefined && !/^[A-Za-z0-9_-]{1,128}$/.test(payload.requestKey)) throw new SearchError('Chave de repetição inválida.',400);
    const sources = (await catalog.get()).data()?.sources || [];
    const terms = normalize(payload.query).split(' ').filter(word=>word.length > 2);
    const selected = sources.filter(source=>(!source.discoveredAt || source.verifiedProductContext) && terms.some(term=>normalize(source.keywords).includes(term))).map(source=>source.url);
    input = config({...payload,pncp:true,discover:payload.discover ?? !(payload.sources || []).length,
      sources:[...new Set([...(payload.sources || []),...selected])].slice(0,20)});
    id = payload.requestKey ? createHash('sha256').update(payload.requestKey).digest('hex').replace(/^(.{8})(.{4})(.{4})(.{4})(.{12}).*$/,'$1-$2-$3-$4-$5') : randomUUID();
  }
  const ref = jobs.doc(id);
  const now = Date.now(), leaseToken = randomUUID();
  const claimed = await db.runTransaction(async transaction => {
    const previous = (await transaction.get(ref)).data();
    if (previous && (previous.status === 'finished' || previous.leaseUntil > now || (!match && previous.status === 'waiting')))
      return {owned:false,job:previous};
    const job = {...(previous || {id,input,createdAt:new Date(now).toISOString(),records:[],report:null}),
      status:'running',leaseUntil:now+60000,leaseToken};
    transaction.set(ref,clean(job));return {owned:true,job};
  });
  if (!claimed.owned) return claimed.job;
  let job = claimed.job;
  try {
    const output = await collectAtivaBatch(job,deps);
    job = output.job;
    if (output.observed.length) await db.runTransaction(async transaction=>{
      const current = (await transaction.get(catalog)).data()?.sources || [];
      const known = new Set(current.map(source=>source.url));
      const observed = new Set(output.observed);
      const updated = current.map(source=>source.discoveredAt && observed.has(source.url)
        ? {...source,verifiedProductContext:true} : source);
      const additions = output.observed.filter(url=>!known.has(url)).map(url=>({url,label:new URL(url).hostname,
        keywords:input.query,verifiedProductContext:true,discoveredAt:new Date().toISOString()}));
      transaction.set(catalog,{sources:[...updated,...additions].slice(0,200)});
    });
  } catch (error) {job.status='failed';job.error=error.message;job.leaseUntil=0;}
  return db.runTransaction(async transaction=>{
    const current = (await transaction.get(ref)).data();
    if (current?.leaseToken !== leaseToken) return current;
    transaction.set(ref,clean(job));return clean(job);
  });
}
