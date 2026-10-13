import {marketplacePlans,normalizeMarketplaceRows} from './marketplaces.js';
import {createHmac,timingSafeEqual} from 'node:crypto';
import {SearchError,normalize} from './verifiedSearch.js';
import {productQuery,discoveryQueries,intentAssessment,declaredRegion} from './purchaseIntent.js';
const actors={facebook:'apify~facebook-groups-scraper',instagram:'apify~instagram-comment-scraper',tiktok:'clockworks~tiktok-comments-scraper'};
const terminal=new Set(['SUCCEEDED','FAILED','ABORTED','TIMED-OUT']);
const sign=(payload,key)=>createHmac('sha256',key).update(payload).digest('base64url');
export function issueJob(payload,key) {const data=Buffer.from(JSON.stringify(payload)).toString('base64url');return data+'.'+sign(data,key);}
export function verifyJob(token,key) {
 if(typeof token!=='string'||token.length>20000)throw new SearchError('Identificador de coleta inválido.',400);
 const [data,signature,...rest]=token.split('.');
 if(!data||!signature||rest.length)throw new SearchError('Coleta inválida.',400);
 const expected=sign(data,key);
 if(rest.length||!signature||Buffer.byteLength(signature)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))throw new SearchError('Coleta não autorizada.',400);
 let payload;try {payload=JSON.parse(Buffer.from(data,'base64url').toString());}catch{throw new SearchError('Coleta inválida.',400);}
 if(payload.expiresAt<Date.now())throw new SearchError('Coleta expirada. Execute uma nova busca.',410);
 return payload;
}
export function platformUrl(raw,platform) {
 try {const u=new URL(raw); if(u.protocol!=='https:'||u.username||u.password)return ''; const host=u.hostname.replace(/^www\.|^m\./,'');
 if(platform==='facebook'&&host==='facebook.com'&&/^\/groups\/[^/]+/.test(u.pathname)) return `https://www.facebook.com${u.pathname.match(/^\/groups\/[^/]+/)[0]}/`;
 if(platform==='instagram'&&host==='instagram.com'&&/^\/(p|reel)\/[\w-]+/.test(u.pathname))return `https://www.instagram.com${u.pathname.match(/^\/(p|reel)\/[\w-]+/)[0]}/`;
 if(platform==='tiktok'&&host==='tiktok.com'&&/^\/@[\w.]+\/video\/\d+/.test(u.pathname))return `https://www.tiktok.com${u.pathname}`;
 }catch{}return '';
}
async function api(path,token,options={},deps={}) {
 const response=await (deps.fetcher || fetch)(`https://api.apify.com/v2/${path}`,{...options,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',...options.headers},signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw new SearchError(`Apify respondeu HTTP ${response.status}. Verifique token, saldo e acesso ao Actor.`);
 return response.json();
}
export async function discoverSources(query,location,deps={}) {
 const key=deps.serperKey ?? process.env.SERPER_API_KEY;
 if(!key)return {sources:[],warnings:['SERPER_API_KEY ausente: informe links públicos de origem para a coleta social.']};
 const results=await Promise.all(discoveryQueries(query,location).map(async search=>{
 try {const response=await (deps.fetcher || fetch)('https://google.serper.dev/search',{method:'POST',headers:{'X-API-KEY':key,'Content-Type':'application/json'},body:JSON.stringify({q:search.q,gl:'br',hl:'pt-br',num:10}),signal:AbortSignal.timeout(10000)});
 if(!response.ok)return {sources:[],warning:`Descoberta ${search.platform}: HTTP ${response.status}.`};
 const data=await response.json();return {sources:(data.organic||[]).map(item=>({platform:search.platform,url:platformUrl(item.link,search.platform)})).filter(s=>s.url)};
 }catch{return {sources:[],warning:`Descoberta ${search.platform} indisponível.`};}
 }));
 return {sources:results.flatMap(r=>r.sources),warnings:results.map(r=>r.warning).filter(Boolean)};
}
export function normalizeSocialRows(rows,platform,inputUrl) {
 const output=[];
 for(const row of rows) {
  if(row.error||row.errorCode)continue;
  if(platform==='facebook') {
   if(row.text)output.push({text:row.text,name:row.user?.name || '',authorUrl:row.user?.url || (row.user?.id && /^\d+$/.test(row.user.id) ? `https://www.facebook.com/profile.php?id=${row.user.id}` : ''),sourceUrl:row.url || '',publishedAt:row.time,id:row.legacyId || row.id});
   for(const c of row.topComments||[])output.push({text:c.text,name:c.profileName || '',authorUrl:c.profileUrl || '',sourceUrl:c.commentUrl || row.url || '',publishedAt:c.date,id:c.id});
  }else if(platform==='instagram') {
   output.push({text:row.text,name:row.ownerUsername || '',authorUrl:/^[\w.]+$/.test(row.ownerUsername||'')?`https://www.instagram.com/${row.ownerUsername}/`:'',sourceUrl:row.commentUrl || row.postUrl || inputUrl,publishedAt:row.timestamp,id:row.id});
  }else if(platform==='tiktok') {
   output.push({text:row.text,name:row.uniqueId || '',authorUrl:/^[\w.]+$/.test(row.uniqueId||'')?`https://www.tiktok.com/@${row.uniqueId}`:'',sourceUrl:row.videoWebUrl || inputUrl,publishedAt:row.createTimeISO,id:row.cid});
  }
 }
 return output;
}
export function qualifySocialRecord(record,platform,query,location,retrievedAt=new Date().toISOString()) {
 const assessment=intentAssessment(record.text,query), region=declaredRegion(record.text,location);
 if(!assessment.qualified||!region.matched||!record.sourceUrl||!record.name||/\*{2,}|anonymous|anonimo/i.test(record.name))return null;
 // Validate the source domain, not an arbitrary URL in a dataset row.
 try {const u=new URL(record.sourceUrl);if(u.protocol!=='https:'||!['facebook.com','www.facebook.com','m.facebook.com','instagram.com','www.instagram.com','tiktok.com','www.tiktok.com'].includes(u.hostname))return null;}catch{return null;}
 const lead={name:record.name,phone:'',email:'',instagram:'',location:region.label,profileUrl:record.sourceUrl,authorProfileUrl:record.authorUrl,platform,recordType:'purchase_mention',verificationStatus:'source_observed',intent:record.text,category:'',decisionMaker:'',decisionMakerPhone:'',whatsapp:'',tem_whatsapp:null,evidence:{},matchedProduct:assessment.matchedProduct,geographicStatus:region.status,purchaseIntentClassification:assessment.classification};
 function set(field,value,excerpt=record.text){lead[field]=value;lead.evidence[field]={value,sourceUrl:record.sourceUrl,source:`Apify — ${actors[platform]}`,retrievedAt,excerpt,recordId:String(record.id||'')};}
 set('name',record.name);set('intent',record.text);if(record.authorUrl)set('authorProfileUrl',record.authorUrl);
 if(region.label)set('location',region.label,record.text);
 if(platform==='instagram'&&record.authorUrl)set('instagram',record.authorUrl);
 // Only a number explicitly offered by the same author in the same post/comment.
 const phone=String(record.text).match(/(?:meu\s+(?:whats(?:app)?|telefone)|me\s+cham[ae]\s+(?:no\s+)?whats(?:app)?)\s*[:=\-]?\s*((?:\+?55[ .-]?)?\(?\d{2}\)?[ .-]?9?\d{4}[ .-]?\d{4})/i)?.[1];
 if(phone){let d=phone.replace(/\D/g,'');if(d.startsWith('55')&&d.length>11)d=d.slice(2);if(/^[1-9]\d(?:9\d{8}|[2-5]\d{7})$/.test(d))set('phone',phone);}
 const email=String(record.text).match(/meu\s+e-?mail\s*[:=\-]?\s*([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i)?.[1];if(email)set('email',email);
 if(record.publishedAt&&!Number.isNaN(Date.parse(record.publishedAt))) {set('publishedAt',record.publishedAt);set('demandTimeframe',`Publicado em ${record.publishedAt}`);}
 lead.trendingInsights=[`Produto mencionado: ${assessment.matchedProduct}`,`Expressão de intenção (heurística): ${assessment.expression}`,`Texto original: ${record.text}`];
 return lead;
}
export async function startSocialRadar(body,deps={}) {
 const token=deps.apifyToken ?? process.env.APIFY_API_TOKEN;
 if(!token)throw new SearchError('Configure APIFY_API_TOKEN no servidor para coletar comentários sociais.',503);
 const query=productQuery(body.query),location=String(body.location||'').trim(),count=Number(body.count||30);
 if(!query||query.length>300||location.length>160||!Number.isInteger(count)||count<1||count>100)throw new SearchError('Informe produto, região e quantidade de 1 a 100.',400);
 if(!location)throw new SearchError('Informe Cidade - UF para o radar social regional.',400);
 let manual=Array.isArray(body.sourceUrls)?body.sourceUrls:[];
 if(manual.length>9||manual.some(u=>typeof u!=='string'||u.length>500))throw new SearchError('Informe até nove links públicos.',400);
 const configured=String(process.env.BLITZ_PUBLIC_SOCIAL_URLS||'').split(/[\n,]/).map(s=>s.trim()).filter(Boolean);
 const markets=await marketplacePlans({...body,query},deps);
 const discovery=manual.length||configured.length?{sources:[],warnings:[]}:await discoverSources(query,location,deps);
 const sources=[...manual,...configured].flatMap(raw=>Object.keys(actors).map(platform=>({platform,url:platformUrl(raw,platform)})).filter(s=>s.url)).concat(discovery.sources);
 if(manual.length&&!sources.length&&!markets.plans.length)throw new SearchError('Use links de grupo Facebook, post/reel Instagram ou vídeo TikTok públicos.',400);
 // One source per platform and capped rows: breadth grows through subsequent targeted runs.
 const selected=Object.keys(actors).map(platform=>sources.find(s=>s.platform===platform)).filter(Boolean).concat(markets.plans);
 if(!selected.length)return {done:true,leads:[],meta:{intent:'b2c_consumer',summary:'Nenhuma origem social pública encontrada. Informe links de grupos, posts ou vídeos.',targetAudience:'Menções públicas',warnings:discovery.warnings}};
 const warnings=[...discovery.warnings,...markets.warnings];
 const runs=(await Promise.all(selected.map(async source=>{
  const limit=Math.min(100,Math.max(30,count));
  const actorInput=source.input || (source.platform==='facebook'?{startUrls:[{url:source.url}],resultsLimit:limit,viewOption:'CHRONOLOGICAL',onlyPostsNewerThan:'30 days'}:source.platform==='instagram'?{directUrls:[source.url],resultsLimit:limit,includeNestedComments:false}:{postURLs:[source.url],commentsPerPost:limit,maxRepliesPerComment:0});
  try {const data=await api(`acts/${source.actor || actors[source.platform]}/runs?waitForFinish=0&timeout=240&maxItems=${limit}&maxTotalChargeUsd=${Number(process.env.BLITZ_APIFY_MAX_USD_PER_RUN || 0.5)}`,token,{method:'POST',body:JSON.stringify(actorInput)},deps);
   if(!data.data?.id)throw new Error('Missing run ID');return {platform:source.platform,url:source.url,runId:data.data.id};
  }catch(err){warnings.push(`${source.platform}: ${err.message}`);return null;}
 }))).filter(Boolean);
 if(!runs.length)throw new SearchError(warnings.join(' ')||'Nenhuma coleta social foi iniciada.');
 const job=issueJob({query,location,count,runs,warnings,userId:deps.userId || null,expiresAt:Date.now()+30*60*1000},token);
 return {done:false,job,leads:[],meta:{intent:'b2c_consumer',summary:`Coleta social iniciada em ${runs.length} origens públicas.`,targetAudience:'Autores com intenção textual e região declarada',warnings}};
}
export async function pollSocialRadar(body,deps={}) {
 const token=deps.apifyToken ?? process.env.APIFY_API_TOKEN;if(!token)throw new SearchError('APIFY_API_TOKEN ausente.',503);
 const job=verifyJob(body.job,token);
 if(job.userId && job.userId!==deps.userId)throw new SearchError('Esta coleta pertence a outra conta.',403);
 const warnings=[...job.warnings],leads=[],marketplaceSignals=[],statuses=[];
 await Promise.all(job.runs.map(async run=>{
  try {const data=await api(`actor-runs/${encodeURIComponent(run.runId)}`,token,{},deps),status=data.data?.status;
   if(!status)throw new SearchError('Resposta Apify sem status da coleta.');statuses.push({platform:run.platform,status});
   if(status!=='SUCCEEDED'){if(terminal.has(status))warnings.push(`${run.platform}: coleta terminou com ${status}.`);return;}
   const id=data.data.defaultDatasetId;if(!id)throw new SearchError('Dataset não encontrado.');
   const rows=await api(`datasets/${encodeURIComponent(id)}/items?clean=true&format=json&limit=100`,token,{},deps);
   if(!Array.isArray(rows))throw new SearchError('Dataset incompatível.');
   if(['shopee','mercado_livre'].includes(run.platform)){marketplaceSignals.push(...normalizeMarketplaceRows(rows,run.platform,job.query,job.location));return;}
   for(const record of normalizeSocialRows(rows,run.platform,run.url)) {const lead=qualifySocialRecord(record,run.platform,job.query,job.location);if(lead)leads.push(lead);}
  }catch(err){const previous=statuses.find(s=>s.platform===run.platform);if(previous)previous.status='PROVIDER_ERROR';else statuses.push({platform:run.platform,status:'PROVIDER_ERROR'});warnings.push(`${run.platform}: ${err.message}`);}
 }));
 const unique=[...new Map(leads.map(l=>[`${l.platform}:${l.authorProfileUrl||l.name}:${l.evidence.intent.recordId||l.intent}`,l])).values()].slice(0,job.count);
 const done=statuses.length===job.runs.length&&statuses.every(s=>terminal.has(s.status)||s.status==='PROVIDER_ERROR');
 return {done,job:body.job,leads:unique,marketplaceSignals,meta:{intent:'b2c_consumer',summary:`${unique.length} menções qualificadas por produto, intenção textual e região declarada; ${marketplaceSignals.length} registros de marketplaces sem contato de comprador. ${done?'Coleta concluída.':'Coleta em andamento.'}`,targetAudience:'Autores públicos; intenção classificada por regras',warnings:[...warnings,'Marketplaces: perguntas anônimas e vendas históricas não identificam compradores nem sua localização.','Perfil do autor é um canal de contato. Telefone só é exibido se oferecido pelo próprio autor. Participar de grupo local não comprova residência.'],statuses}};
}
export async function socialRadar(body,deps={}) {return body.action==='poll'?pollSocialRadar(body,deps):startSocialRadar(body,deps);}
