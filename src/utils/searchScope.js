// Shared by the browser and API: requesting buyers is not a Places category search.
const plain = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
export function requestsBuyers(query) {
  return /^(?:(?:busco|procuro|buscar|encontrar|quero|preciso de)\s+)?(?:comprador(?:a|es|as)?\s+(?:de|para)|compra(?:r)?\s+de)\b/.test(plain(query));
}
export function isBuyerSearch(query, audience) {
  return audience === 'pf' || requestsBuyers(query);
}
export function isNationalScope(location) {
  return /^(?:|brasil|brasil todo|todo o brasil|em todo o brasil|nacional|todo territorio nacional|todo o territorio nacional)$/.test(plain(location));
}
export function buyerLocation(location) {
  return isNationalScope(location) ? 'Brasil' : String(location).trim();
}
