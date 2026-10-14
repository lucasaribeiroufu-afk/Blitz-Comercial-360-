import {SearchError} from './verifiedSearch.js';
import {socialSource,publication,publicAuthor} from '../../worker/urls.js';
export function workerConfigured() {return !!(process.env.SOCIAL_WORKER_URL && process.env.SOCIAL_WORKER_TOKEN);}
export function socialPlatform(url) {try{return socialSource(url).platform;}catch{return '';}}
export async function collectSocialWorker(body,deps={}) {
  const origin=deps.workerUrl ?? process.env.SOCIAL_WORKER_URL;
  const token=deps.workerToken ?? process.env.SOCIAL_WORKER_TOKEN;
  if(!origin||!token)return {records:[],pending:[],reports:[{source:'Worker social',status:'blocked',consulted:false,errors:[],limits:['worker não configurado: configure SOCIAL_WORKER_URL e SOCIAL_WORKER_TOKEN no servidor.']}]};
  const url=new URL(origin);
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/'||(url.port&&url.port!=='443'))throw new SearchError('SOCIAL_WORKER_URL deve ser uma origem HTTPS sem credenciais/caminho.',503);
  const response=await (deps.workerFetcher||fetch)(new URL('/collect',url),{
    method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
    body:JSON.stringify({query:body.query,location:body.location,sourceUrls:body.sourceUrls,maxSources:6,maxPages:2,maxRecords:100}),
    redirect:'error',signal:AbortSignal.timeout(Math.max(1,Math.min(21000,(deps.deadline || Date.now()+22000)-Date.now()-1000))),
  });
  if(!response.ok)throw new SearchError(`Worker indisponível: HTTP ${response.status}.`,503);
  // Bound the response before JSON parsing; do not trust worker identities or out-of-platform evidence URLs.
  let text='',size=0;const decoder=new TextDecoder();
  if(response.body?.getReader){const reader=response.body.getReader();try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>1500000){await reader.cancel();throw new SearchError('Resposta do worker excede limite.',502);}text+=decoder.decode(value,{stream:true});}}finally{reader.releaseLock();}}
  else text=JSON.stringify(await response.json());
  text+=decoder.decode();
  const data=JSON.parse(text);
  if(!Array.isArray(data.records)||data.records.length>200||!Array.isArray(data.reports)||data.reports.length>12)throw new SearchError('Resposta do worker incompatível.',502);
  data.records=data.records.filter(r=>typeof r.text==='string'&&r.text.length<=6000&&typeof r.name==='string'&&r.name.length<=150&&publication(r.sourceUrl,r.platform)&&publicAuthor(r.authorUrl,r.platform));
  data.pending=(data.pending||[]).filter(s=>socialPlatform(s.url)===s.platform).slice(0,9);
  return data;
}
