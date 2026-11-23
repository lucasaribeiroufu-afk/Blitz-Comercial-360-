import {createHash} from 'node:crypto';
import {load} from 'cheerio';
import {declaredRegion} from '../src/server/purchaseIntent.js';
import {normalize, parsePage, validCnpj} from '../src/server/verifiedSearch.js';
import {canonicalUrl} from './config.js';
import {demandSignal, contextualSignal} from './signals.js';
import {observations as collectObservations} from './observations.js';
import {productRelevant} from './relevance.js';

const types = object => [object?.['@type']].flat();
const isOrganization = object => types(object).some(type => ['Organization','Corporation','LocalBusiness',
  'Store','GroceryStore','HardwareStore','WholesaleStore','ShoppingCenter',
  'HomeAndConstructionBusiness','GeneralContractor','ProfessionalService'].includes(type));
export const identity = value => createHash('sha256').update(value).digest('hex');

export function extract(html, sourceUrl, options, now = Date.now()) {
  const $ = load(html, {xmlMode:/^\s*(?:<\?xml|<rss|<feed)/i.test(html)});
  const title = $('title').first().text();
  if ($('input[type=password],iframe[src*="captcha"],[id*="cf-challenge"],.g-recaptcha').length ||
      /captcha|verify you are human|just a moment|access denied|sign in to continue/i.test(title))
    return {blocked:'challenge_or_login', records:[], links:[]};
  const retrievedAt = new Date(now).toISOString();
  const digest = identity(html);
  const records = [];
  const evidence = (value, excerpt = value) => ({value, excerpt, sourceUrl, retrievedAt, contentHash:digest, source:'Página pública empresarial'});
  // Organization identity and its contact belong to the same structured object.
  // Arbitrary mailto links or comment text cannot supply corporate contact fields.
  const parsed = parsePage(html);
  const structured = parsed.records;
  const productOnPage = productRelevant([parsed.title,parsed.text,...parsed.blocks].join(' '),options);
  const audience = options.audience || 'b2b';
  for (const organization of structured.filter(isOrganization).filter(() => audience !== 'b2c')) {
    if (options.discover && !productOnPage) continue;
    if (typeof organization.name !== 'string' || !organization.name.trim() || typeof organization.url !== 'string') continue;
    let website;
    try {website = canonicalUrl(organization.url);} catch {continue;}
    if (new URL(website).hostname !== new URL(sourceUrl).hostname) continue;
    const email = String(organization.email || '').replace(/^mailto:/i, '');
    const phone = String(organization.telephone || '');
    const lead = {key:identity(`company:${website}:${organization.name}`), recordType:'potential_company',
      name:organization.name, website, profileUrl:website, matchedProduct:options.query,
      verificationStatus:'source_observed', evidence:{name:evidence(organization.name)},
      prospectingBasis:'Contato empresarial publicado. Compra e aplicação do produto dependem de confirmação.'};
    const address = organization.address;
    const locality = typeof address?.addressLocality === 'string' ? address.addressLocality : '';
    const region = typeof address?.addressRegion === 'string' ? address.addressRegion : '';
    if (locality) {
      lead.location = [locality, region].filter(Boolean).join(' - ');
      lead.evidence.location = evidence(lead.location);
    }
    if (normalize(options.location) !== 'brasil') {
      const requested = normalize(options.location).replace(/ /g, '');
      const actual = normalize(lead.location).replace(/ /g, '');
      if (locality && region && actual !== requested) continue;
      if (!locality || !region) {lead.recordType = 'region_unconfirmed'; lead.geographicStatus = 'unconfirmed';}
    }
    if (validCnpj(organization.taxID || '')) {
      lead.cnpj = String(organization.taxID).replace(/\D/g, ''); lead.evidence.cnpj = evidence(lead.cnpj);
    }
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      lead.email = email; lead.evidence.email = evidence(email);
    }
    if (/^\+?[\d ()-]{10,24}$/.test(phone)) {
      lead.phone = phone; lead.evidence.phone = evidence(phone);
    }
    records.push(lead);
  }
  const observations = collectObservations(structured,$);
  // An identified structured author is required for every qualified request.
  const discarded = {product_or_intent:0, date:0, author:0, region:0, url:0};
  for (const observation of observations) {
    if (typeof observation.text !== 'string') continue;
    const text = observation.text.slice(0, 12000);
    let contextUrl;
    try {contextUrl = canonicalUrl(observation.contextUrl || sourceUrl);} catch {contextUrl = '';}
    const context = contextUrl && new URL(contextUrl).origin === new URL(sourceUrl).origin ? observation.context : '';
    const assessment = demandSignal(text, options.query, options.alternatives) || contextualSignal(text,context,options.query,options.alternatives);
    if (!assessment) {discarded.product_or_intent++; continue;}
    const published = Date.parse(observation.publishedAt);
    const ageDays = (now - published) / 86400000;
    const historical = ageDays > options.maxAgeDays;
    const historicalQuestion = context && ['price_question','service_question'].includes(assessment.type) && ageDays <= 5 * 366;
    if (!Number.isFinite(published) || ageDays < 0 || (historical && !historicalQuestion)) {
      discarded.date++; continue;
    }
    const corporate = isOrganization(observation.author);
    const person = types(observation.author).includes('Person');
    if ((!corporate && !person) || (audience === 'b2b' && !corporate) ||
        (audience === 'b2c' && !person) || typeof observation.author.name !== 'string' ||
        !observation.author.name.trim()) {discarded.author++; continue;}
    let publication;
    try {publication = canonicalUrl(observation.url || sourceUrl);} catch {discarded.url++; continue;}
    if (new URL(publication).origin !== new URL(sourceUrl).origin) {discarded.url++; continue;}
    const region = declaredRegion(text, options.location);
    const national = normalize(options.location) === 'brasil';
    if (!national && region.status === 'conflicting') {discarded.region++; continue;}
    const host = new URL(publication).hostname.replace(/^(www|m)\./, '');
    const platform = ({'facebook.com':'facebook','instagram.com':'instagram','tiktok.com':'tiktok','reclameaqui.com.br':'reclame_aqui'})[host] || 'website';
    const intentEvidence = {...evidence(text, text), source:'Publicação pública estruturada'};
    records.push({key:identity(`publication:${publication}:${observation.author.name}:${text}`),
      recordType:national || region.matched ? assessment.type : 'region_unconfirmed',
      geographicStatus:national || region.matched ? 'matched' : 'unconfirmed',
      category:assessment.type, ...(historical ? {historical:true} : {}),
      prospectingBasis:assessment.relation === 'alternative' ? 'Sinal sobre alternativa informada. Compatibilidade comercial depende de revisão.' : 'Publicação sobre o produto pesquisado.',
      name:observation.author.name, profileUrl:publication, platform, intent:text,
      entityType:corporate ? 'pj' : 'pf',
      matchedProduct:assessment.matchedProduct, reportedPrice:assessment.reportedPrice, publishedAt:new Date(published).toISOString(),
      location:region.authorDeclared || '', verificationStatus:'source_observed',
      classification:assessment.classification, reviewRequired:assessment.reviewRequired || false,
      evidence:{intent:intentEvidence,...(assessment.reviewRequired ? {context:{...evidence(context),sourceUrl:contextUrl}} : {})}});
  }
  // Discover one-hop publications referenced by RSS/Atom and ordinary same-host HTML links.
  const links = [], socialLinks = [];
  $('a[href],item link,entry link,url loc,sitemap loc').each((_index, element) => {
    const node = $(element);
    try {
      const url = canonicalUrl(new URL(node.attr('href') || node.text().trim(), sourceUrl).href);
      if (new URL(url).origin === new URL(sourceUrl).origin &&
          !/\.(pdf|jpg|png|jpeg|zip|mp4|css|js)$/i.test(new URL(url).pathname)) links.push(url);
      const target = new URL(url);
      if (productOnPage && /(^|\.)(instagram\.com|facebook\.com|tiktok\.com|youtube\.com|reclameaqui\.com\.br)$/.test(target.hostname) &&
          target.pathname !== '/' && !/\b(sharer|share|login|signin|intent)\b/i.test(target.pathname)) socialLinks.push(url);
    } catch { /* Non-HTTP navigation is outside the crawl queue. */ }
  });
  return {records, links:options.discover && !productOnPage ? [] : [...new Set(links)], socialLinks:[...new Set(socialLinks)].slice(0,8), discarded, contentHash:digest,
    document:{url:sourceUrl, title:title.slice(0, 300), body:parsed.text.slice(0, 24000), fetchedAt:retrievedAt}};
}
