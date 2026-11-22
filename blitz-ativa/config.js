export function config(input) {
  if (!input || typeof input.query !== 'string' || !input.query.trim() || input.query.length > 200)
    throw Error('Informe um produto com até 200 caracteres.');
  const audience = input.audience ?? 'b2b';
  if (!['b2b','b2c','both'].includes(audience)) throw Error('Público inválido.');
  const alternatives = input.alternatives ?? [];
  if (!Array.isArray(alternatives) || alternatives.length > 12 || alternatives.some(term => typeof term !== 'string' || !term.trim() || term.length > 120))
    throw Error('Informe até 12 alternativas com até 120 caracteres cada.');
  const sources = input.sources ?? [];
  if (!Array.isArray(sources) || sources.length > 20) throw Error('Informe até 20 fontes públicas.');
  const urls = [...new Set(sources.map(canonicalUrl))];
  const location = String(input.location || 'Brasil').trim();
  if (location.length > 160) throw Error('Localidade muito longa.');
  const limit = (key, fallback, maximum) => {
    const value = input[key] ?? fallback;
    if (!Number.isInteger(value) || value < 1 || value > maximum) throw Error(`Limite inválido: ${key}`);
    return value;
  };
  if (input.pncp !== undefined && typeof input.pncp !== 'boolean') throw Error('pncp deve ser booleano.');
  if (input.wide !== undefined && typeof input.wide !== 'boolean') throw Error('wide deve ser booleano.');
  if (input.discover !== undefined && typeof input.discover !== 'boolean') throw Error('discover deve ser booleano.');
  if (!urls.length && !input.pncp && input.discover === false) throw Error('Informe fontes ou ative descoberta automática.');
  return {query:input.query.trim(), location, audience, alternatives:[...new Set(alternatives.map(term => term.trim()))], sources:urls, wide:input.wide === true, discover:input.discover ?? !urls.length, pncp:input.pncp === true,
    maxPages:limit('maxPages', 20, 100), maxDepth:limit('maxDepth', 2, 3),
    maxAgeDays:limit('maxAgeDays', 30, 365), pncpPages:limit('pncpPages', 2, 5)};
}

export function canonicalUrl(raw) {
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443'))
    throw Error('A fonte deve usar HTTPS público sem credenciais.');
  if (/token|password|secret|api[_-]?key|signature/i.test(url.search)) throw Error('URL contém possível credencial.');
  url.hash = '';
  for (const key of [...url.searchParams.keys()])
    if (/^utm_|^(fbclid|gclid)$/i.test(key)) url.searchParams.delete(key);
  return url.href;
}
