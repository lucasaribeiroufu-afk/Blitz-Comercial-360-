import {apiHeaders} from './apiAuth';
import type { ExtractedResult, ExtractionApiConfig, PlatformType, SearchIntelligenceMeta, MarketplaceSignal } from '../types';
export const DEFAULT_API_CONFIG: ExtractionApiConfig = {apiUrl:'',apiKey:'',authHeaderName:'Authorization',requestMethod:'POST',useCustomApi:false};
export interface DeepSearchResult {leads: ExtractedResult[]; meta?: SearchIntelligenceMeta; marketplaceSignals?: MarketplaceSignal[];}
export function isUrl(input: string) {return /^(https?:\/\/|www\.)/i.test(input.trim());}
export function normalizeUrl(input: string) {const s=input.trim(); return s && !/^https?:\/\//i.test(s) ? `https://${s}` : s;}
export function detectPlatform(url: string): PlatformType {return url.includes('instagram.com') ? 'instagram' : url.includes('google.com/maps') ? 'google_maps' : 'website';}
async function request(route: string, body: object): Promise<any> {
 const response = await fetch(route,{method:'POST',headers:await apiHeaders(),body:JSON.stringify(body),signal:AbortSignal.timeout(55000)});
 const data = await response.json().catch(() => {throw new Error('O servidor não retornou dados JSON. Verifique a implantação das rotas /api.');});
 if (!response.ok) throw new Error(data.error || `Falha HTTP ${response.status}. Nenhum dado substituto foi criado.`);
 return data;
}
export async function searchGoogleLeads(term: string, location: string, count=6, config?: ExtractionApiConfig, objective?: string, page=1, offset=0, excludeNames: string[]=[], targetEntityType:'both'|'pf'|'pj'='both', expansionMode:'cluster'|'strict'='strict', searchSeed: number|string=Date.now()): Promise<DeepSearchResult> {
 if(config?.useCustomApi) throw new Error('API personalizada desativada: os dados externos ainda não possuem validação de proveniência. Use as fontes configuradas no servidor.');
 return request('/api/deep-search',{query:term,location,count,objective,page,offset,excludeNames,targetEntityType,expansionMode:'strict',searchSeed});
}
export async function extractFromDirectUrl(rawUrl: string, config?: ExtractionApiConfig): Promise<ExtractedResult> {
 if(config?.useCustomApi) throw new Error('Use a coleta de fontes no servidor.');
 const data=await request('/api/extract-url',{url:normalizeUrl(rawUrl)});
 return data.lead;
}
export async function searchB2CLeads(query: string, location: string, count=30, sourceUrls: string[]=[], onProgress?: (message:string)=>void, includeMarketplaces=false): Promise<DeepSearchResult> {
 let data=await request('/api/b2c-multifactor-search',{query,location,count,sourceUrls,includeMarketplaces});
 if(!data.job)return data;
 for(let attempt=0;attempt<45&&!data.done;attempt++) {
  onProgress?.(data.meta?.summary || 'Coletando publicações públicas...');
  await new Promise(resolve=>setTimeout(resolve,7000));
  data=await request('/api/social-radar',{action:'poll',job:data.job});
 }
 if(!data.done)throw new Error('Coleta ainda em processamento no Apify. Nenhum contato foi fabricado; consulte a execução na sua conta.');
 return {leads:data.leads,meta:data.meta,marketplaceSignals:data.marketplaceSignals || []};
}
