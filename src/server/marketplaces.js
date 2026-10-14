import {SearchError,normalize} from './verifiedSearch.js';
import {productQuery,intentAssessment,declaredRegion,productVariants} from './purchaseIntent.js';
export const marketplaceActors={mercado_livre:'piotrv1001~mercado-libre-questions-scraper',shopee:'paulovitor18~shopee-brasil-produtos'};
export function marketplaceUrl(raw,platform) {
 try {const u=new URL(raw);if(u.protocol!=='https:'||u.username||u.password)return '';
  if(platform==='shopee'&&['shopee.com.br','www.shopee.com.br'].includes(u.hostname)&&(/\/product\/\d+\/\d+/.test(u.pathname)||/-i\.\d+\.\d+/.test(u.pathname)))return u.href;
  if(platform==='mercado_livre'&&u.hostname==='produto.mercadolivre.com.br'&&/^\/MLB-\d+/.test(u.pathname))return u.href;
 }catch{}return '';
}
export function productMatches(name,query) {
 const text=normalize(name).split(' ');
 return productVariants(query).some(v=>{const words=normalize(v).split(' ').filter(w=>!['de','da','do','para','e'].includes(w));return words.length && words.every(w=>text.includes(w)||text.includes(w+'s'));});
}
export async function marketplacePlans(body,deps={}) {
 if(!body.includeMarketplaces)return {plans:[],warnings:[]};
 const query=productQuery(body.query),limit=Math.min(30,Math.max(5,Number(body.count)||10)),manual=Array.isArray(body.sourceUrls)?body.sourceUrls:[];
 const shopee=manual.map(u=>marketplaceUrl(u,'shopee')).find(Boolean);
 const plans=[{platform:'shopee',actor:marketplaceActors.shopee,url:shopee||'',input:shopee?{urls:[shopee],maxItensPorBusca:limit,enriquecerLoja:false}:{palavrasChave:[query],maxItensPorBusca:limit,enriquecerLoja:false}}],warnings=[];
 let mercado=manual.map(u=>marketplaceUrl(u,'mercado_livre')).find(Boolean);
 const key=deps.serperKey ?? process.env.SERPER_API_KEY;
 if(!mercado&&key) {
  try {const response=await (deps.fetcher||fetch)('https://google.serper.dev/search',{method:'POST',headers:{'X-API-KEY':key,'Content-Type':'application/json'},body:JSON.stringify({q:`site:produto.mercadolivre.com.br "${query}"`,gl:'br',hl:'pt-br',num:10}),signal:AbortSignal.timeout(10000)});
   if(!response.ok)throw new SearchError(`HTTP ${response.status}`);
   const data=await response.json();mercado=(data.organic||[]).filter(item=>productMatches(item.title,query)).map(item=>marketplaceUrl(item.link,'mercado_livre')).find(Boolean);
  }catch{warnings.push('Descoberta de anúncios do Mercado Livre indisponível. Informe o link de um anúncio.');}
 }
 if(mercado)plans.push({platform:'mercado_livre',actor:marketplaceActors.mercado_livre,url:mercado,input:{items:[mercado],maxQuestionsPerItem:limit}});
 else warnings.push('Nenhum anúncio do Mercado Livre identificado. Cole um link de produto para coletar suas perguntas públicas.');
 return {plans,warnings};
}
export function normalizeMarketplaceRows(rows,platform,query,location,retrievedAt=new Date().toISOString()) {
 const results=[];
 for(const row of rows) {
  if(row.error||row.errorCode||['no_questions','invalid_input','failed'].includes(row.status))continue;
  if(platform==='mercado_livre') {
   const url=marketplaceUrl(row.itemUrl,'mercado_livre');if(!url||typeof row.question!=='string'||!row.question.trim())continue;
   const assessment=intentAssessment(row.question,query),region=declaredRegion(row.question,location);
   results.push({platform,recordType:'marketplace_question',sourceUrl:url,itemId:String(row.itemId||''),questionId:String(row.questionId||''),question:row.question,answer:typeof row.answer==='string'?row.answer:'',answerDate:row.answerDate||'',classification:assessment.qualified?'textual_purchase_request':'product_question',regionalMatch:region.matched,regionEvidence:region.matched?row.question:'',name:'',phone:'',email:'',buyerIdentityAvailable:false,questionDate:null,evidence:{question:{value:row.question,sourceUrl:url,source:`Apify — ${marketplaceActors.mercado_livre}`,retrievedAt,excerpt:row.question}}});
  }else if(platform==='shopee') {
   const url=marketplaceUrl(row.url,'shopee');if(!url||typeof row.nome!=='string'||!productMatches(row.nome,query))continue;
   const fields={name:row.nome};
   for(const [field,key] of [['priceBRL','preco'],['soldCount','vendidos']]) if(typeof row[key]==='number'&&Number.isFinite(row[key])&&row[key]>=0)fields[field]=row[key];
   for(const [field,key] of [['shippingOrigin','cidade_envio'],['soldPeriod','vendidos_periodo'],['shopName','loja_nome']])if(typeof row[key]==='string'&&row[key])fields[field]=row[key];
   if(typeof row.preco_no_pix==='boolean')fields.priceIsPix=row.preco_no_pix;
   const evidence=Object.fromEntries(Object.entries(fields).map(([field,value])=>[field,{value,sourceUrl:url,source:`Apify — ${marketplaceActors.shopee}`,retrievedAt,excerpt:String(value)}]));
   results.push({...fields,platform,recordType:'marketplace_product',sourceUrl:url,regionalMatch:null,buyerIdentityAvailable:false,classification:'product_catalog_and_historical_sales',evidence});
  }
 }
 return results;
}
