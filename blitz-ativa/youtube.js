import {socialEvidence} from './social.js';

function videoId(raw) {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password) return '';
    const host = url.hostname.replace(/^www\./,'');
    const id = host === 'youtu.be' ? url.pathname.slice(1) : host === 'youtube.com' ? url.searchParams.get('v') : '';
    return /^[\w-]{11}$/.test(id || '') ? id : '';
  } catch {return '';}
}

export async function collectYoutube(input, {youtubeKey = process.env.YOUTUBE_API_KEY, fetcher = fetch, deadline = Infinity} = {}) {
  const reports = [], rows = [];
  if (!youtubeKey) return {records:[],reports:[{source:'YouTube API',status:'not_configured',reason:'Configure YOUTUBE_API_KEY no servidor para ler vídeos e comentários públicos.'}]};
  let requests = 0;
  async function call(resource, params) {
    if (Date.now()+500 >= deadline) throw Error('Janela de execução esgotada.');
    const url = new URL(`https://www.googleapis.com/youtube/v3/${resource}`);
    for (const [key,value] of Object.entries(params)) url.searchParams.set(key,String(value));
    // The key stays in a server-side header, outside evidence URLs and logs.
    const response = await fetcher(url,{headers:{'X-Goog-Api-Key':youtubeKey},redirect:'error',
      signal:AbortSignal.timeout(Math.max(1,Math.min(6000,deadline-Date.now())))});
    requests++;
    if (!response.ok) throw Error(`YouTube API HTTP ${response.status}`);
    const body = await response.text();
    if (body.length > 1200000) throw Error('Resposta YouTube excede limite.');
    return JSON.parse(body);
  }
  try {
    let ids = [...new Set(input.sources.map(videoId).filter(Boolean))].slice(0,3);
    if (!ids.length) {
      const result = await call('search',{part:'snippet',q:input.query,type:'video',maxResults:3,relevanceLanguage:'pt',safeSearch:'moderate'});
      ids = (result.items || []).map(item=>item.id?.videoId).filter(id=>/^[\w-]{11}$/.test(id || ''));
    }
    if (!ids.length) return {records:[],reports:[{source:'YouTube API',status:'collected',received:0,requests}]};
    const videos = await call('videos',{part:'snippet',id:ids.join(',')});
    for (const video of videos.items || []) {
      const sourceUrl = `https://www.youtube.com/watch?v=${video.id}`;
      const report = {source:'YouTube API',url:sourceUrl,status:'running',received:0};
      reports.push(report);
      try {
        const result = await call('commentThreads',{part:'snippet',videoId:video.id,maxResults:100,order:'time',textFormat:'plainText'});
        for (const thread of result.items || []) {
          const comment = thread.snippet?.topLevelComment;
          const snippet = comment?.snippet;
          if (!snippet?.authorDisplayName || !snippet.authorChannelUrl || !comment.id) continue;
          rows.push({text:snippet.textOriginal || snippet.textDisplay,name:snippet.authorDisplayName,
            authorUrl:snippet.authorChannelUrl,sourceUrl:`${sourceUrl}&lc=${encodeURIComponent(comment.id)}`,
            publishedAt:snippet.publishedAt,platform:'youtube',
            context:[video.snippet?.title,video.snippet?.description].filter(Boolean).join('\n').slice(0,12000),
            contextUrl:sourceUrl,collector:'YouTube Data API v3 — comentário público'});
        }
        report.received = result.items?.length || 0;
        report.status = result.nextPageToken ? 'limited' : 'collected';
        if (result.nextPageToken) report.reason = 'Primeira página de até 100 comentários por vídeo. Respostas e páginas adicionais permanecem fora desta amostra.';
      } catch (error) {report.status='blocked';report.reason=error.message;}
    }
  } catch (error) {reports.push({source:'YouTube API',status:'failed',reason:error.message});}
  return {records:socialEvidence(rows,input),reports,requests};
}
