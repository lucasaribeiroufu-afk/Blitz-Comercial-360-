import {apiHeaders} from './apiAuth';
import {readApiResponse} from './apiResponse';
import {ativaApi} from './ativaApi';
import type { ExtractedResult, ExtractionApiConfig, PlatformType, SearchIntelligenceMeta, MarketplaceSignal, ExecutionReport } from '../types';
export const DEFAULT_API_CONFIG: ExtractionApiConfig = {apiUrl:'',apiKey:'',authHeaderName:'Authorization',requestMethod:'POST',useCustomApi:false};
export interface DeepSearchResult {leads: ExtractedResult[]; meta?: SearchIntelligenceMeta; marketplaceSignals?: MarketplaceSignal[]; regionalUnconfirmed?: ExtractedResult[]; pendingSources?: Array<{platform:string;url:string}>;}
export function isUrl(input: string) {return /^(https?:\/\/|www\.)/i.test(input.trim());}
export function normalizeUrl(input: string) {const s=input.trim(); return s && !/^https?:\/\//i.test(s) ? `https://${s}` : s;}
export function detectPlatform(url: string): PlatformType {return url.includes('instagram.com') ? 'instagram' : url.includes('google.com/maps') ? 'google_maps' : 'website';}
async function request(route: string, body: object): Promise<any> {
 const response = await fetch(route,{method:'POST',headers:await apiHeaders(),body:JSON.stringify(body),signal:AbortSignal.timeout(55000)});
 return readApiResponse(response, route);
}
export async function searchGoogleLeads(term: string, location: string, count=6, config?: ExtractionApiConfig, objective?: string, page=1, offset=0, excludeNames: string[]=[], targetEntityType:'both'|'pf'|'pj'='both', expansionMode:'cluster'|'strict'='strict', searchSeed: number|string=Date.now(), prospectMode:'evidence'|'potential'='evidence', targetSectors:string[]=[]): Promise<DeepSearchResult> {
 if(config?.useCustomApi) throw new Error('API personalizada desativada: os dados externos ainda não possuem validação de proveniência. Use as fontes configuradas no servidor.');
 return request('/api/deep-search',{query:term,location,count,objective,page,offset,excludeNames,targetEntityType,expansionMode:'strict',searchSeed,prospectMode,targetSectors});
}
export async function extractFromDirectUrl(rawUrl: string, config?: ExtractionApiConfig): Promise<ExtractedResult> {
 if(config?.useCustomApi) throw new Error('Use a coleta de fontes no servidor.');
 const data=await request('/api/extract-url',{url:normalizeUrl(rawUrl)});
 return data.lead;
}
export async function searchB2CLeads(query: string, location: string, count=30, sourceUrls: string[]=[], onProgress?: (message:string)=>void, includeMarketplaces=false, onExecution?: (report:ExecutionReport,unconfirmed:ExtractedResult[])=>void, publicB2C?: {segment:string}): Promise<DeepSearchResult> {
 let data=await request('/api/b2c-multifactor-search',{query,location,count,sourceUrls,includeMarketplaces,publicB2C});
 onExecution?.(data.meta?.executionReport,data.regionalUnconfirmed||[]);
 if(!data.job && !data.ativaJob)return data;
 for(let attempt=0;attempt<45&&!data.done;attempt++) {
  onProgress?.(data.meta?.summary || 'Coletando publicações públicas...');
  await new Promise(resolve=>setTimeout(resolve,7000));
  data=await request('/api/social-radar',{action:'poll',job:data.job});onExecution?.(data.meta?.executionReport,data.regionalUnconfirmed||[]);
 }
 if(!data.done)throw new Error('Coleta ainda em processamento no Apify. Nenhum contato foi fabricado; consulte a execução na sua conta.');
 if(data.ativaJob) {
  let fallback;
  for(let attempt=0;attempt<60;attempt++) {
   onProgress?.('Blitz Ativa assumiu a coleta após esgotamento de créditos ou orçamento. A execução também está no histórico Blitz Ativa.');
   fallback=await ativaApi({action:'get',id:data.ativaJob.id});
   if(['finished','failed'].includes(fallback.status))break;
   await new Promise(resolve=>setTimeout(resolve,4000));
  }
  if(fallback?.status!=='finished')throw new Error('Blitz Ativa continua pendente ou encontrou falha. Consulte a execução no histórico Blitz Ativa.');
  const incoming=fallback.records.filter((record:any)=>record.recordType==='purchase_mention');
  const previous=new Set(data.leads.map((record:any)=>[record.profileUrl,record.name,record.publishedAt].join('|')));
  data.leads=[...data.leads,...incoming.filter((record:any)=>!previous.has([record.profileUrl,record.name,record.publishedAt].join('|')))].slice(0,count);
  data.meta.summary=`Blitz Ativa concluiu a coleta com ${incoming.length} pedidos publicados. Estado ${fallback.report.state}.`;
  data.meta.executionReport={...data.meta.executionReport,state:fallback.report.state,summary:data.meta.summary,
   sources:data.meta.executionReport.sources.map((source:any)=>source.source.startsWith('Blitz Ativa')
    ? {...source,status:fallback.report.state==='complete'?'complete':'limited',received:fallback.records.length,qualified:incoming.length} : source)};
  onExecution?.(data.meta.executionReport,data.regionalUnconfirmed||[]);
 }
 return {leads:data.leads,meta:data.meta,marketplaceSignals:data.marketplaceSignals || [],regionalUnconfirmed:data.regionalUnconfirmed||[],pendingSources:data.pendingSources||[]};
}
