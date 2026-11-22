import {setTimeout as sleep} from 'node:timers/promises';
import {canonicalUrl} from './config.js';
import {productRelevant} from './relevance.js';
import {rawRead} from './http.js';
import infrastructure from './infrastructure.json' with {type:'json'};

export function discoveryPlan(input) {
  const region = input.location === 'Brasil' ? '' : input.location;
  return [
    {purpose:'regional', query:`${input.query} ${region}`.trim()},
    {purpose:'competitors', query:input.query},
    {purpose:'social', query:`${input.query} (site:instagram.com OR site:facebook.com OR site:tiktok.com OR site:youtube.com)`},
    {purpose:'experiences', query:`${input.query} (site:reclameaqui.com.br OR "quero comprar" OR "quanto custa" OR "não funcionou")`},
  ].filter((item,index,all)=>all.findIndex(other=>other.query === item.query) === index);
}

// Search results supply discovery URLs only. Qualification always reads the original page.
export async function discover(input, {read = rawRead, deadline = Infinity,
  searxUrl = process.env.BLITZ_ATIVA_SEARXNG_URL || infrastructure.searxUrl, authToken = process.env.BLITZ_ATIVA_SEARXNG_AUTH_TOKEN, maxQueries = 4} = {}) {
  const reports = [], candidates = new Map();
  const groups = [];
  const engine = searxUrl ? 'SearXNG configurado' : 'Mwmbl público';
  const plan = discoveryPlan(input).slice(0,searxUrl ? maxQueries : Math.min(2,maxQueries));
  for (const [index, search] of plan.entries()) {
    if (Date.now()+1500 >= deadline) {reports.push({source:engine,status:'limited',reason:'Janela de descoberta esgotada.'});break;}
    if (index) await sleep(1100);
    const report = {source:engine,kind:'discovery',query:search.query,purpose:search.purpose,status:'running',retrievedAt:new Date().toISOString()};
    reports.push(report);
    try {
      const url = new URL(searxUrl ? canonicalUrl(searxUrl) : 'https://api.mwmbl.org/api/v2/search/');
      if (searxUrl) {
        if (url.pathname !== '/' || url.search || url.hash) throw Error('SearXNG exige uma origem HTTPS sem caminho.');
        url.pathname = '/search';url.searchParams.set('format','json');url.searchParams.set('language','pt-BR');
      }
      url.searchParams.set('q',search.query);
      const response = await read(url.href,{timeout:Math.max(1,Math.min(searxUrl ? 8000 : 3500,deadline-Date.now())),
        ...(searxUrl && authToken ? {authorization:`Bearer ${authToken}`} : {})});
      if (response.status !== 200) throw Error(`HTTP ${response.status}`);
      const data = JSON.parse(response.body);
      if (!Array.isArray(data.results)) throw Error('Resposta de descoberta inválida.');
      const group = [];
      for (const item of data.results.slice(0,20)) {
        try {
          const link = canonicalUrl(item.url);
          if (!productRelevant(`${item.title || ''} ${item.content || ''} ${decodeURIComponent(new URL(link).pathname)}`,input)) {
            report.discardedIrrelevant = (report.discardedIrrelevant || 0)+1;continue;
          }
          if (/\.(pdf|zip|jpg|jpeg|png|mp4)$/i.test(new URL(link).pathname)) continue;
          group.push(link);
          if (!candidates.has(link)) candidates.set(link,{url:link,title:String(item.title || '').slice(0,300),
            purpose:search.purpose,query:search.query,source:engine,retrievedAt:report.retrievedAt,status:'discovered'});
        } catch { /* Unusable destinations never enter the collection queue. */ }
      }
      groups.push(group);
      report.status = 'collected';report.received = data.results.length;
      if (data.unresponsive_engines?.length) {report.status='limited';report.reason='Parte dos mecanismos de pesquisa está indisponível.';}
    } catch (error) {
      report.status = /HTTP (401|403|429)/.test(error.message) ? 'blocked' : 'failed';
      report.reason = error.message;
      // A refused quota/access request is not retried against another identity or endpoint.
      break;
    }
  }
  const ranked = [...new Set(Array.from({length:20},(_,index)=>groups.map(group=>group[index])).flat().filter(Boolean))].slice(0,20);
  return {sources:ranked,candidates:ranked.map(url=>candidates.get(url)),reports,
    coverage:searxUrl ? 'Índice do SearXNG configurado, incluindo consultas por redes e experiências.' :
      'Índice público Mwmbl com cobertura limitada. Acesso anônimo sujeito à quota e disponibilidade do serviço. SearXNG próprio amplia as consultas.'};
}
