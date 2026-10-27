import {isBuyerSearch, isNationalScope} from '../utils/searchScope.js';
import {structuralPhone} from './professionalContacts.js';
import {enrichBusinessContacts} from './businessContacts.js';
/** Evidence-only collection. No model output or synthetic database is used here. */
import https from 'node:https';
import { load } from 'cheerio';
import dns from 'node:dns/promises';
import net from 'node:net';

export class SearchError extends Error {
  constructor(message, status = 502) { super(message); this.status = status; }
}
export const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const evidence = (value, sourceUrl, source, retrievedAt, excerpt = String(value)) => ({ value, sourceUrl, source, retrievedAt, excerpt });
const base = () => ({ name: '', phone: '', location: '', profileUrl: '', platform: 'website', email: '', instagram: '', cnpj: '', whatsapp: '', establishmentPhone: '', decisionMakerPhone: '', decisionMaker: '', department: '', competitorPrices: '', demandTimeframe: '', tem_whatsapp: null, evidence: {}, verificationStatus: 'source_observed' });
function set(lead, field, value, url, source, at, excerpt) {
  if (value !== undefined && value !== null && value !== '') { lead[field] = value; lead.evidence[field] = evidence(value, url, source, at, excerpt); }
}
function input(body = {}) {
  if (typeof body.query !== 'string' || !body.query.trim()) throw new SearchError('Informe um termo de busca.', 400);
  if (body.query.length > 300 || (body.location || '').length > 160) throw new SearchError('Consulta muito longa.', 400);
  const count = Number(body.count ?? 10), offset = Number(body.offset ?? 0);
  if (!Number.isInteger(count) || count < 1 || count > 100 || !Number.isInteger(offset) || offset < 0 || offset > 100) throw new SearchError('Quantidade deve ser de 1 a 100; deslocamento de 0 a 100.', 400);
  return { ...body, query: body.query.trim(), location: String(body.location || '').trim(), count, offset };
}
export function validCnpj(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  for (const n of [12, 13]) {
    let sum = 0, weight = n - 7;
    for (let i = 0; i < n; i++) { sum += Number(d[i]) * weight; weight = weight === 2 ? 9 : weight - 1; }
    const digit = sum % 11 < 2 ? 0 : 11 - sum % 11;
    if (digit !== Number(d[n])) return false;
  }
  return true;
}
export function publicIp(ip) {
  if (net.isIP(ip) === 4) {
    const [a,b] = ip.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0)) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19)));
  }
  // Reject mapped IPv4 and all non-global IPv6, including loopback, ULA and link-local.
  return net.isIP(ip) === 6 && /^2[0-9a-f]{3}:/i.test(ip);
}
export async function readPublicPage(rawUrl, redirects = 0, deadline = Date.now() + 8000, options = {}) {
  let url;
  try { url = new URL(rawUrl); } catch { throw new SearchError('URL inválida.', 400); }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) throw new SearchError('Use uma URL pública HTTPS sem credenciais.', 400);
  if(options.allowedHosts&&!options.allowedHosts.includes(url.hostname.toLowerCase()))throw new SearchError('Redirecionamento para fonte não autorizada.',400);
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (Date.now() >= deadline) throw new SearchError('Tempo limite ao ler a fonte.');
  const addresses = net.isIP(host) ? [{ address: host, family: net.isIP(host) }] : await Promise.race([dns.lookup(host, { all: true }), new Promise((_,reject) => { const timer = setTimeout(() => reject(new SearchError('Tempo limite de DNS.')), Math.max(1,deadline-Date.now())); timer.unref(); })]);
  if (!addresses.length || addresses.some(a => !publicIp(a.address))) throw new SearchError('Endereço privado ou reservado bloqueado.', 400);
  const pinned = addresses[0];
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Blitz360-EvidenceCollector/1.0', Accept: 'text/html,application/xhtml+xml' }, lookup: (_host, _options, callback) => callback(null, pinned.address, pinned.family) }, res => {
      if ([301,302,303,307,308].includes(res.statusCode)) {
        res.resume();
        if (redirects >= 3 || !res.headers.location) return reject(new SearchError('Redirecionamento não resolvido.'));
        readPublicPage(new URL(res.headers.location, url).href, redirects + 1, deadline, options).then(resolve, reject); return;
      }
      if (res.statusCode !== 200) { res.resume(); return reject(Object.assign(new SearchError(`Fonte indisponível (HTTP ${res.statusCode}).`),{httpStatus:res.statusCode})); }
      if (!(options.allowText ? /^(text\/(html|plain|xml)|application\/(rss\+xml|atom\+xml|xml|xhtml\+xml))/i.test(String(res.headers['content-type'])) : String(res.headers['content-type']).includes('text/html'))) { res.resume(); return reject(new SearchError('A fonte não é uma página HTML.')); }
      let size = 0, chunks = [];
      res.on('data', chunk => { size += chunk.length; if (size > 1500000) { req.destroy(new SearchError('Página excede o limite de leitura.')); } else chunks.push(chunk); });
      res.on('error', reject);
      res.on('end', () => resolve({ html: Buffer.concat(chunks).toString('utf8'), url: url.href }));
    });
    const timer = setTimeout(() => req.destroy(new SearchError('Tempo limite ao ler a fonte.')), Math.max(1, deadline-Date.now()));
    req.on('close', () => clearTimeout(timer)); req.on('error', reject);
  });
}
export function parsePage(html) {
  const $ = load(html), records = [];
  function visit(value) { if (Array.isArray(value)) value.forEach(visit); else if (value && typeof value === 'object') { records.push(value); if (value['@graph']) visit(value['@graph']); } }
  $('script[type="application/ld+json"]').each((_i, element) => { try { visit(JSON.parse($(element).html() || '')); } catch {} });
  const title = $('title').text().replace(/\s+/g, ' ').trim();
  $('script,style,noscript,[hidden],[aria-hidden="true"]').remove();
  // Boundaries between posts/blocks remain distinct; do not combine separate authors' claims.
  const blocks = $('p,article,li,blockquote').map((_i, element) => $(element).text().replace(/\s+/g,' ').trim()).get();
  const text = $('body').text().replace(/\s+/g,' ').trim();
  return {text,title,records,blocks};
}
async function json(url, options = {}, fetcher = fetch) {
  const response = await fetcher(url, { ...options, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new SearchError(`A fonte de dados respondeu HTTP ${response.status}. Verifique credenciais e quota.`);
  return response.json();
}
export async function cnpjLookup(raw, deps = {}) {
  if (!validCnpj(raw)) throw new SearchError('CNPJ inválido: confira os dígitos verificadores.', 400);
  const cnpj = raw.replace(/\D/g, ''), url = `https://brasilapi.com.br/api/cnpj/v1/${cnpj}`;
  const data = await json(url, {}, deps.fetcher), at = new Date().toISOString(), lead = base();
  if (String(data.cnpj).replace(/\D/g, '') !== cnpj || !data.razao_social) throw new SearchError('Resposta cadastral incompatível com o CNPJ consultado.');
  for (const [field,value] of Object.entries({ name: data.nome_fantasia || data.razao_social, company: data.razao_social, cnpj, razao_social: data.razao_social, nome_fantasia: data.nome_fantasia, phone: data.ddd_telefone_1, establishmentPhone: data.ddd_telefone_1, email: data.email, category: data.cnae_fiscal_descricao, socios: (data.qsa || []).map(s => ({ nome: s.nome_socio, qualificacao: s.qualificacao_socio })), location: [data.logradouro, data.numero, data.bairro, data.municipio, data.uf, data.cep].filter(Boolean).join(', ') })) set(lead,field,value,url,'BrasilAPI — cadastro CNPJ (não comprova telefone ativo)',at);
  lead.corporateOfficers=lead.socios||[];lead.companyContactLabel='Contato cadastral da empresa';lead.phoneStructure=structuralPhone(lead.phone);
  lead.profileUrl = url; lead.platform = 'other'; lead.entityType = 'pj';
  lead.addressComponents = [{longText:data.municipio,types:['administrative_area_level_2']},{shortText:data.uf,types:['administrative_area_level_1']}];
  if (deps.casaKey || process.env.CASA_DOS_DADOS_API_KEY) {
    try {const casa = await casaCnpjLookup({cnpj},deps); lead.casaEvidence = casa.evidence;}
    catch {lead.collectionWarnings = ['Enriquecimento Casa dos Dados indisponível; cadastro BrasilAPI preservado.'];}
  }
  lead.corporateOfficers=lead.socios||[];lead.companyContactLabel='Contato cadastral da empresa';return lead;
}
function result(leads, p, warnings = []) {
  return { leads, meta: { intent: 'direct_search', summary: leads.length ? `${leads.length} registros coletados com fonte. Campos ausentes não foram inferidos.` : `Nenhum resultado auditado encontrado para ${p.query} em ${p.location || 'Brasil'}. Verifique os termos ou tente outra região.`, targetAudience: 'Registros públicos observados', trendingItems: [], warnings, retrievedAt: new Date().toISOString(), requestedCount: p.count, returnedCount: leads.length } };
}
const UF = new Set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '));
export function matchesLocation(place, location) {
  if (isNationalScope(location)) return true;
  const parts = location.trim().split(/[,\-]/).map(s => s.trim()).filter(Boolean);
  let state = parts.at(-1)?.toUpperCase(), city = parts[0];
  if (!UF.has(state)) { const match = location.match(/\s+([A-Za-z]{2})$/); state = match && UF.has(match[1].toUpperCase()) ? match[1].toUpperCase() : ''; if (state) city = location.slice(0, match.index).trim(); }
  const components = place.addressComponents || [];
  const cityNames = components.filter(c => c.types?.some(t => ['locality','administrative_area_level_2'].includes(t))).map(c => normalize(c.longText));
  const stateCode = components.find(c => c.types?.includes('administrative_area_level_1'))?.shortText;
  return cityNames.includes(normalize(city)) && (!state || stateCode === state);
}
export async function searchBusinesses(body, deps = {}) {
  const p = input(body);
  if (/^[\d.\/-]+$/.test(p.query)) { const lead = await cnpjLookup(p.query, deps); return result(!p.location || matchesLocation({addressComponents:lead.addressComponents},p.location) ? [lead] : [], p); }
  if (isBuyerSearch(p.query, p.targetEntityType)) {const {startBuyerRadar}=await import('./buyerRadar.js');return startBuyerRadar(body,deps);}
  const key = deps.mapsKey ?? (process.env.GOOGLE_MAPS_API_KEY || process.env.CHAVE_API_DO_GOOGLE_MAPS);
  if (!key) throw new SearchError('Configure GOOGLE_MAPS_API_KEY no servidor e habilite Places API (New).', 503);
  const leads = [], seen = new Set(), excluded = new Set((p.excludeNames || []).map(normalize));
  let token;
  for (let page = 0; page < 3 && leads.length < p.count + p.offset; page++) {
    const data = await json('https://places.googleapis.com/v1/places:searchText', { method:'POST', headers:{ 'Content-Type':'application/json', 'X-Goog-Api-Key':key, 'X-Goog-FieldMask':'places.id,places.displayName,places.formattedAddress,places.addressComponents,places.nationalPhoneNumber,places.rating,places.userRatingCount,places.websiteUri,places.googleMapsUri,places.primaryTypeDisplayName,nextPageToken' }, body:JSON.stringify({ textQuery:[p.query,p.location].filter(Boolean).join(' em '), languageCode:'pt-BR', regionCode:'BR', pageSize:20, ...(token ? {pageToken:token} : {}) }) }, deps.fetcher);
    for (const place of data.places || []) {
      if (!place.id || !place.displayName?.text || !matchesLocation(place,p.location) || seen.has(place.id) || excluded.has(normalize(place.displayName.text))) continue;
      // Conservative textual category match. Reject ambiguity instead of substituting another niche.
      const terms = normalize(p.query).split(' ').filter(t => !['de','da','do','e','para','em'].includes(t));
      const searchable = normalize(`${place.displayName.text} ${place.primaryTypeDisplayName?.text || ''}`);
      if (!terms.length || !terms.every(t => searchable.split(' ').some(w => w === t || w === t+'s' || t === w+'s' || (t.length >= 5 && w.slice(0,-1) === t.slice(0,-1))))) continue;
      seen.add(place.id);
      const lead = base(), at = new Date().toISOString(), url = place.googleMapsUri || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.displayName.text)}&query_place_id=${encodeURIComponent(place.id)}`;
      lead.platform = 'google_maps'; lead.entityType = 'pj'; lead.companyContactLabel = 'Contato da empresa'; lead.profileUrl = url;
      for (const [field,value] of Object.entries({ name:place.displayName.text, location:place.formattedAddress, phone:place.nationalPhoneNumber, establishmentPhone:place.nationalPhoneNumber, rating:place.rating, reviewsCount:place.userRatingCount, website:place.websiteUri, category:place.primaryTypeDisplayName?.text })) set(lead,field,value,url,'Google Places',at);
      leads.push(lead);
    }
    token = data.nextPageToken; if (!token) break;
  }
  const selected=leads.slice(p.offset,p.offset+p.count);
  const enriched=await Promise.all(selected.map((lead,index)=>index<3 ? enrichBusinessContacts(lead,deps) : lead));
  return result(enriched,p,['Até três sites comerciais vinculados foram considerados para coletar links públicos de telefone e email. Ausência de contato não é corrigida por inferência.','Correspondência conservadora de categoria pode omitir empresas relevantes. Google Places não informa intenção de compra, CNPJ ou responsável por compras.']);
}
export async function extractWebsite(body, deps = {}) {
  const page = await (deps.readPage || readPublicPage)(body.url), parsed = parsePage(page.html), lead = base(), at = new Date().toISOString();
  const orgs = parsed.records.filter(r => [r['@type']].flat().some(t => ['Organization','LocalBusiness','Corporation','Store'].includes(t)));
  // Multiple organizations on a directory cannot be merged into one contact.
  const org = orgs.length === 1 ? orgs[0] : null;
  lead.profileUrl = page.url;
  set(lead,'name',org?.name || parsed.title,page.url,org ? 'Página — JSON-LD organização' : 'Título da página (identidade não confirmada)',at);
  if (!lead.name) throw new SearchError('A página não fornece identificação estruturada nem título.');
  if (org) {
    for (const field of ['email','telephone']) if (typeof org[field] === 'string') set(lead, field === 'telephone' ? 'phone' : field, org[field],page.url,'Página — JSON-LD organização',at);
    if (org.address && typeof org.address === 'object') set(lead,'location',['streetAddress','addressLocality','addressRegion','postalCode'].map(k => org.address[k]).filter(v => typeof v === 'string').join(', '),page.url,'Página — JSON-LD organização',at);
    const instagram = [org.sameAs || []].flat().find(u => typeof u === 'string' && /^https:\/\/(www\.)?instagram\.com\/[\w.]+\/?$/.test(u));
    if (instagram) set(lead,'instagram',instagram,page.url,'Página — JSON-LD sameAs',at);
    if (typeof org.taxID === 'string' && validCnpj(org.taxID)) set(lead,'cnpj',org.taxID,page.url,'Página — CNPJ declarado, não consultado',at);
  }
  return { lead, warnings: org ? ['Dados declarados pela página; disponibilidade do telefone não testada.'] : ['Somente o título foi coletado; não foi confirmado que a página representa uma empresa.'] };
}
export function buyerExcerpt(text, query, location) {
  const terms = normalize(query).split(' ').filter(t => !['de','da','do','e','para','em'].includes(t));
  const matches = text.matchAll(/(?:quero comprar|preciso comprar|estou procurando|procuro|onde compro|onde comprar|preciso de)\b/gi);
  for (const m of matches) {
    const excerpt = text.slice(Math.max(0,m.index-80),m.index+350), norm = normalize(excerpt);
    if (terms.length && terms.every(t => norm.split(' ').includes(t)) && (!location || norm.includes(normalize(location))) && !/adicionar ao carrinho|compre agora|compre online|vendemos|à venda/i.test(excerpt)) return excerpt;
  }
  return '';
}
export async function searchBuyers(body, deps = {}) {
  const {startBuyerRadar}=await import('./buyerRadar.js');
  return startBuyerRadar(body,deps);
}
export function makeHandler(operation) {
  return async (req,res) => {
    res.setHeader('Cache-Control','no-store');
    if (req.method !== 'POST') return res.status(405).json({error:'Método não permitido.'});
    try { return res.status(200).json(await operation(req.body || {})); }
    catch (err) { return res.status(err.status || 502).json({error:err instanceof SearchError ? err.message : 'Falha ao acessar a fonte. Nenhum resultado substituto foi criado.'}); }
  };
}

export async function resolvePublicPhone(body, deps = {}) {
 if (!body.cnpj) throw new SearchError('Informe um CNPJ válido para consultar o telefone cadastral. Decisor e WhatsApp não serão inferidos.',422);
 const lead = await cnpjLookup(body.cnpj,deps);
 return {phone:lead.phone,establishmentPhone:lead.phone,source:lead.evidence.phone?.source || '',sourcesFound:lead.evidence.phone ? [lead.evidence.phone.sourceUrl] : [],evidence:lead.evidence};
}

export async function casaCnpjLookup(body, deps = {}) {
 const key = deps.casaKey ?? process.env.CASA_DOS_DADOS_API_KEY;
 if (!key) throw new SearchError('CASA_DOS_DADOS_API_KEY ausente.',503);
 if (!validCnpj(body.cnpj)) throw new SearchError('CNPJ inválido.',400);
 const cnpj=body.cnpj.replace(/\D/g,''),url=`https://api.casadosdados.com.br/v4/cnpj/${cnpj}`;
 const data=await json(url,{headers:{'api-key':key}},deps.fetcher);
 if(String(data.cnpj).replace(/\D/g,'')!==cnpj||!data.razao_social)throw new SearchError('Cadastro Casa dos Dados incompatível com o CNPJ solicitado.');
 const lead=base(),at=new Date().toISOString();lead.profileUrl=url;lead.platform='other';lead.entityType='pj';
 const e=data.endereco||{};
 for(const [field,value] of Object.entries({cnpj,name:data.nome_fantasia||data.razao_social,razao_social:data.razao_social,nome_fantasia:data.nome_fantasia,location:[e.logradouro,e.numero,e.bairro,e.municipio,e.uf].filter(Boolean).join(', '),socios:(data.quadro_societario||[]).map(s=>({nome:s.nome,qualificacao:s.qualificacao_socio}))}))set(lead,field,value,url,'Casa dos Dados — CNPJ exato',at);
 lead.corporateOfficers=lead.socios||[];lead.companyContactLabel='Contato cadastral da empresa';return lead;
}
