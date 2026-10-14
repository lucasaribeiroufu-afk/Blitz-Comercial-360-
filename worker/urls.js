export const hosts = ['www.instagram.com', 'www.facebook.com', 'www.tiktok.com'];
export function socialSource(raw) {
  let u; try {u = new URL(raw);} catch {throw Error('URL inválida');}
  if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) throw Error('Use HTTPS público sem credenciais');
  const host = u.hostname.replace(/^(www\.|m\.)/, '');
  let platform, path;
  if (host === 'instagram.com' && /^\/(?:p|reel)\/[\w-]+\/?$/.test(u.pathname)) {platform='instagram';path=u.pathname;}
  else if (host === 'instagram.com' && /^\/[\w.]+\/?$/.test(u.pathname) && !/^\/(?:accounts|explore|direct|login|challenge)\/?$/.test(u.pathname)) {platform='instagram';path=u.pathname;}
  else if (host === 'facebook.com' && /^\/(?:groups\/[^/]+(?:\/(?:posts|permalink)\/\d+)?|[^/]+(?:\/posts\/[^/]+)?)\/?$/.test(u.pathname) && !/^\/(login|checkpoint|messages|settings|friends|search)(\/|$)/.test(u.pathname)) {platform='facebook';path=u.pathname;}
  else if (host === 'tiktok.com' && /^\/@[\w.]+(?:\/video\/\d+)?\/?$/.test(u.pathname)) {platform='tiktok';path=u.pathname;}
  else throw Error('Fonte fora do escopo: perfil/post público de Instagram, Facebook ou TikTok');
  const canonical = new URL(`https://www.${host}${path}`);
  if(platform==='facebook' && /^\/profile\.php\/?$/.test(path)) {
    if(!/^\d+$/.test(u.searchParams.get('id')||''))throw Error('Perfil Facebook exige ID público explícito');
    canonical.searchParams.set('id',u.searchParams.get('id'));
  }
  // Preserve explicit comment permalink only; never propagate tokens/tracking/query searches.
  if (platform==='facebook' && /^\d+$/.test(u.searchParams.get('comment_id')||'')) canonical.searchParams.set('comment_id', u.searchParams.get('comment_id'));
  return {platform, url:canonical.href};
}
export function publication(raw, platform) {
  try {const s=socialSource(raw);return s.platform===platform && (platform==='instagram'?/\/(p|reel)\//.test(s.url):platform==='tiktok'?/\/video\//.test(s.url):/\/(posts|permalink)\//.test(s.url)) ? s.url : '';}catch{return '';}
}
export function publicAuthor(raw, platform) {
  try {const s=socialSource(raw);return s.platform===platform && !publication(s.url,platform) ? s.url : '';}catch{return '';}
}
