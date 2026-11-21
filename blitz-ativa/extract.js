import {createHash} from 'node:crypto';
import {load} from 'cheerio';
import {intentAssessment, declaredRegion} from '../src/server/purchaseIntent.js';
import {normalize, parsePage} from '../src/server/verifiedSearch.js';
import {canonicalUrl} from './config.js';

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
  const evidence = (value, excerpt = value) => ({value, excerpt, sourceUrl, retrievedAt, contentHash:digest});
  // Organization identity and its contact belong to the same structured object.
  // Arbitrary mailto links or comment text cannot supply corporate contact fields.
  const structured = parsePage(html).records;
  for (const organization of structured.filter(isOrganization)) {
    if (typeof organization.name !== 'string' || !organization.name.trim() || typeof organization.url !== 'string') continue;
    let website;
    try {website = canonicalUrl(organization.url);} catch {continue;}
    if (new URL(website).hostname !== new URL(sourceUrl).hostname) continue;
    const email = String(organization.email || '').replace(/^mailto:/i, '');
    const phone = String(organization.telephone || '');
    const lead = {key:identity(`company:${website}:${organization.name}`), recordType:'potential_company',
      name:organization.name, website, profileUrl:sourceUrl, matchedProduct:options.query,
      verificationStatus:'source_observed', evidence:{name:evidence(organization.name)},
      prospectingBasis:'Contato empresarial publicado. Compra e aplicação do produto dependem de confirmação.'};
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      lead.email = email; lead.evidence.email = evidence(email);
    }
    if (/^\+?[\d ()-]{10,24}$/.test(phone)) {
      lead.phone = phone; lead.evidence.phone = evidence(phone);
    }
    records.push(lead);
  }
  const observations = structured.filter(object => types(object).some(type =>
    ['SocialMediaPosting','DiscussionForumPosting','Comment','Article','BlogPosting'].includes(type)))
    .map(object => ({text:object.text || object.articleBody, author:object.author,
      publishedAt:object.datePublished, url:object.url || object['@id']}));
  // Feeds without organization-typed authors remain observations, never named B2B buyers.
  const discarded = {product_or_intent:0, date:0, author:0, region:0, url:0};
  for (const observation of observations) {
    if (typeof observation.text !== 'string') continue;
    const text = observation.text.slice(0, 12000);
    const assessment = intentAssessment(text, options.query);
    if (!assessment.qualified) {discarded.product_or_intent++; continue;}
    const published = Date.parse(observation.publishedAt);
    if (!Number.isFinite(published) || published > now || now - published > options.maxAgeDays * 86400000) {
      discarded.date++; continue;
    }
    if (!isOrganization(observation.author) || typeof observation.author.name !== 'string' || !observation.author.name.trim()) {discarded.author++; continue;}
    let publication;
    try {publication = canonicalUrl(observation.url || sourceUrl);} catch {discarded.url++; continue;}
    if (new URL(publication).origin !== new URL(sourceUrl).origin) {discarded.url++; continue;}
    const region = declaredRegion(text, options.location);
    const national = normalize(options.location) === 'brasil';
    if (!national && region.status === 'conflicting') {discarded.region++; continue;}
    const intentEvidence = {...evidence(text, text), source:'Publicação empresarial estruturada'};
    records.push({key:identity(`publication:${publication}:${observation.author.name}:${text}`),
      recordType:national || region.matched ? 'purchase_mention' : 'region_unconfirmed',
      name:observation.author.name, profileUrl:publication, platform:'website', intent:text,
      matchedProduct:options.query, publishedAt:new Date(published).toISOString(),
      location:region.authorDeclared || '', verificationStatus:'source_observed',
      classification:'heuristic_purchase_intent', evidence:{intent:intentEvidence}});
  }
  // Discover one-hop publications referenced by RSS/Atom and ordinary same-host HTML links.
  const links = [];
  $('a[href],item link,entry link').each((_index, element) => {
    const node = $(element);
    try {
      const url = canonicalUrl(new URL(node.attr('href') || node.text().trim(), sourceUrl).href);
      if (new URL(url).origin === new URL(sourceUrl).origin &&
          !/\.(pdf|jpg|png|jpeg|zip|mp4|css|js)$/i.test(new URL(url).pathname)) links.push(url);
    } catch { /* Non-HTTP navigation is outside the crawl queue. */ }
  });
  return {records, links:[...new Set(links)], discarded, contentHash:digest};
}
