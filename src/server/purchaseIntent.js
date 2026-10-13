import { normalize } from './verifiedSearch.js';
const stop = new Set(['de','da','do','e','para','em','uma','um','pessoa','pessoas','cliente','clientes','querendo','quer','comprar','compra','buscando','procurando']);
export function productQuery(raw) {
  return String(raw || '').replace(/^(?:pessoas?|clientes?)\s+(?:querendo|que\s+quer(?:em)?|procurando|buscando)\s+(?:comprar\s+)?/i,'').replace(/^(?:quero|preciso)\s+(?:comprar|de)\s+/i,'').trim();
}
export function productVariants(raw) {
 const query=productQuery(raw), n=normalize(query);
 const variants=[query];
 if (/tinta/.test(n) && /impermeabil/.test(n)) variants.push('tinta para impermeabilizar','tinta emborrachada impermeabilizante','tinta impermeavel');
 if (/geladeira/.test(n)) variants.push(query.replace(/geladeira/i,'refrigerador'));
 if (/refrigerador/.test(n)) variants.push(query.replace(/refrigerador/i,'geladeira'));
 return [...new Set(variants)].slice(0,4);
}
export function intentAssessment(text, rawQuery) {
 const n=normalize(text), variants=productVariants(rawQuery);
 const matched=variants.find(v=>{const words=normalize(v).split(' ').filter(w=>!stop.has(w));return words.length && words.every(w=>n.split(' ').some(t=>t===w || (w.length>5 && t===w+'s')));});
 const buyer=/\b(quero (comprar|adquirir)|preciso (comprar|de)|procuro|procurando|onde (comprar|compro|encontro)|alguem (indica|vende|tem)|busco|gostaria de (comprar|adquirir))\b/.exec(n);
 const seller=/\b(vendo|vendemos|a venda|compre agora|compre online|adicionar ao carrinho|somos (loja|distribuidor)|faca seu pedido)\b/.test(n);
 const negated=/\b(nao quero|nao preciso|nao estou procurando|ja comprei|ja consegui|nao compro|desisti de comprar)\b/.test(n);
 return {qualified:!!matched && !!buyer && !seller && !negated,matchedProduct:matched || '',expression:buyer?.[0] || '',classification:'heuristic_purchase_intent'};
}
export function declaredRegion(text, location) {
 if (!location) return {matched:true,excerpt:'',label:'',status:'not_requested'};
 const city=String(location).replace(/[,\-]?\s*[A-Z]{2}\s*$/i,'').trim(), n=normalize(text), cityN=normalize(city);
 const escaped=cityN.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const pattern=new RegExp(`\\b(?:sou de|moro em|estou em|resido em|aqui em|entrega (?:em|para)|comprar em)\\s+${escaped}\\b(?:\\s+([a-z]{2}))?`,'i');
 const match=n.match(pattern); if(!match) return {matched:false,status:'unconfirmed',excerpt:'',label:''};
 const requestedUf=location.match(/[,\-]?\s*([A-Z]{2})\s*$/i)?.[1]?.toUpperCase();
 const ufCodes=new Set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '));
 const mentionedUf=match[1]?.toUpperCase();
 if (requestedUf && mentionedUf && ufCodes.has(mentionedUf) && mentionedUf!==requestedUf) return {matched:false,status:'conflicting',excerpt:match[0],label:''};
 return {matched:true,status:'self_declared_in_post',excerpt:match[0],label:city + (mentionedUf && ufCodes.has(mentionedUf) ? ` - ${mentionedUf}` : '')};
}
export function discoveryQueries(query, location) {
 const variants=productVariants(query);
 return ['facebook','instagram','tiktok'].flatMap(platform=>variants.slice(0,2).map(product=>({platform,q:`site:${platform}.com ${platform==='facebook' ? 'groups' : platform==='tiktok' ? 'video' : '(reel OR p)'} "${product}" ${location} ("quero comprar" OR "onde comprar" OR "preciso de" OR "procuro")`}))).slice(0,6);
}
