import {productRelevant} from '../../blitz-ativa/relevance.js';
import {crawl} from '../../blitz-ativa/crawler.js';
import {discover} from '../../blitz-ativa/discovery.js';
import {rawRead} from '../../blitz-ativa/http.js';
import {collectYoutube, youtubeReport, youtubeVideoId} from '../../blitz-ativa/youtube.js';
import {socialEvidence} from '../../blitz-ativa/social.js';
import {collectSocialWorker, socialPlatform} from './socialWorker.js';

export async function collectAtivaBatch(job, deps = {}) {
  const input = job.input;
  const previous = job.progress || {seen:[],pending:[],batches:0,pages:0};
  const deadline = Math.min(Date.now()+40000,deps.deadline || Infinity);
  const refreshDiscovery = input.discover && job.report?.discovery && job.report.discovery.relevanceVersion !== 1;
  const discovery = (!refreshDiscovery && job.report?.discovery) || (input.discover ? await (deps.ativaDiscover || discover)(input,{
    deadline:Math.min(deadline-10000,Date.now()+22000),read:deps.ativaRead || rawRead,authToken:deps.authToken,
  }) : {sources:[],candidates:[],reports:[]});
  let sources = previous.batches ? previous.pending : [...new Set([...input.sources,...discovery.sources])];
  if (refreshDiscovery) {
    const origins = new Set([...input.sources,...discovery.sources].map(url=>new URL(url).origin));
    sources = [...new Set([...sources.filter(url=>origins.has(new URL(url).origin)),
      ...discovery.sources.filter(url=>!previous.seen.includes(url))])];
  }
  const webBudget = previous.pages < 120 && previous.batches < 10;
  const social = input.wide && webBudget ? sources.filter(socialPlatform) : [];
  const youtubeEnabled = input.wide || input.sources.some(youtubeVideoId);
  const webSources = sources.filter(url=>!social.includes(url) && !(youtubeEnabled && youtubeVideoId(url)));
  const selectedSocial = social.slice(0,3);
  const youtube = youtubeEnabled && (!previous.batches || previous.youtubePending?.length) ? (deps.ativaYoutube || collectYoutube)({...input,sources},{deadline,pending:previous.youtubePending}) : Promise.resolve({records:[],reports:[]});
  const dom = selectedSocial.length ? (deps.ativaSocial || collectSocialWorker)({query:input.query,location:input.location,sourceUrls:selectedSocial},
    {...deps,deadline:Math.min(deadline,Date.now()+19000)}).catch(error=>({records:[],pending:[],reports:[{source:'Worker social',status:'blocked',reason:error.message}]})) : Promise.resolve({records:[],pending:[],reports:[]});
  const web = webBudget ? (deps.ativaCrawl || crawl)({...input,sources:webSources,visitedSources:previous.seen,maxPages:Math.min(12,120-previous.pages),maxDepth:1},{
    deadline,read:url=>(deps.ativaRead || rawRead)(url,{timeout:Math.max(1,Math.min(6000,deadline-Date.now()))}),
  }) : Promise.resolve({records:[],pages:[],pending:sources,limited:sources.length > 0});
  const [output, worker, video] = await Promise.all([web,dom,youtube]);
  const newRecords = [...output.records,...socialEvidence(worker.records,input),...video.records];
  const records = [...new Map([...job.records,...newRecords].map(record=>[record.key,record])).values()];
  const signalPriority = record=>{
    if (record.platform === 'website' || !record.platform) return 0;
    const type = record.category || record.recordType;
    return ({purchase_mention:5,price_question:4,service_question:4,repurchase_interest:3,positive_experience:1}[type] || 0) +
      (record.historical ? -5 : 0);
  };
  records.sort((a,b)=>signalPriority(b)-signalPriority(a) || (a.historical && b.historical ? b.publishedAt.localeCompare(a.publishedAt) : 0));
  const reports = [...(job.report?.reports || discovery.reports).filter(page=>!page.youtubePending),...output.pages,...worker.reports,...video.reports];
  const seen = [...new Set([...previous.seen,...output.pages.map(page=>page.url).filter(Boolean),...selectedSocial])];
  const pending = [...new Set([...(output.pending || []),...social.slice(3),...(worker.pending || []).map(source=>source.url)])]
    .filter(url=>!seen.includes(url)).slice(0,96);
  const youtubePending = video.pending || [];
  const progress = {seen,pending,youtubePending,batches:previous.batches+1,pages:previous.pages+output.pages.length+selectedSocial.length};
  const canContinue = youtubePending.length > 0 || (input.wide && pending.length > 0 && progress.pages < 120 && progress.batches < 10);
  const youtubeReports = youtubePending.map(video=>youtubeReport(video,'in_progress','Comentários e respostas ainda na fila.'));
  const collected = reports.some(page=>['collected','complete','limited'].includes(page.status) && page.kind !== 'discovery');
  const partial = output.limited || pending.length > 0 || youtubePending.length > 0 || reports.some(page=>!['collected','complete'].includes(page.status));
  const result = {...job,records:records.slice(0,input.wide ? 200 : 50),progress,
    status:canContinue ? 'waiting' : 'finished',leaseUntil:0,
    report:{discovery,reports:[...reports,...youtubeReports.map(page=>({...page,youtubePending:true}))],paidProviderCalls:0,youtubeApiRequests:(job.report?.youtubeApiRequests || 0)+(video.requests || 0),generatedAt:new Date().toISOString(),
      recordLimitReached:records.length > (input.wide ? 200 : 50),
      state:collected ? partial ? 'partial' : 'complete' : 'unavailable',
      coverage:input.wide ? 'Coleta em lotes retomáveis. Até 120 páginas, 10 lotes e 200 registros por pesquisa. A interface continua a fila enquanto estiver aberta. Execução recorrente em segundo plano requer agendamento configurado.' :
        'Coleta de até 12 páginas e 50 registros dentro da janela de 40 segundos. Cobertura sujeita ao índice e ao acesso público.'}};
  while (Buffer.byteLength(JSON.stringify(result)) > 850000 && result.records.length) {
    result.records.pop();result.report.recordLimitReached=true;result.report.state='partial';
  }
  const relevant = new Set((output.documents || []).filter(document=>productRelevant(`${document.title} ${document.body}`,input)).map(document=>document.url));
  return {job:result,observed:output.pages.filter(page=>page.status === 'collected' && relevant.has(page.url)).map(page=>page.url)};
}
