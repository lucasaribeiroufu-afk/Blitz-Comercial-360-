import {socialEvidence} from './social.js';

function videoId(raw) {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password) return '';
    const host = url.hostname.replace(/^www\./,'');
    const id = host === 'youtu.be' ? url.pathname.slice(1) : ['youtube.com','m.youtube.com'].includes(host) ? (url.searchParams.get('v') || url.pathname.match(/^\/(?:shorts|live|embed)\/([\w-]{11})\/?$/)?.[1]) : '';
    return /^[\w-]{11}$/.test(id || '') ? id : '';
  } catch {return '';}
}

export async function collectYoutube(input, {youtubeKey = process.env.YOUTUBE_API_KEY, fetcher = fetch, deadline = Infinity, pending} = {}) {
  const reports = [], records = new Map();
  let queue = pending ? structuredClone(pending) : [];
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
    if (!pending) {
      let ids = [...new Set(input.sources.map(videoId).filter(Boolean))].slice(0,3);
      if (!ids.length) {
        const result = await call('search',{part:'snippet',q:input.query,type:'video',maxResults:3,relevanceLanguage:'pt',safeSearch:'moderate',...(input.location?.toLowerCase() === 'brasil' ? {regionCode:'BR'} : {})});
        ids = (result.items || []).map(item=>item.id?.videoId).filter(id=>/^[\w-]{11}$/.test(id || ''));
      }
      if (!ids.length) return {records:[],reports:[{source:'YouTube API',status:'collected',received:0,requests}]};
      const videos = await call('videos',{part:'snippet',id:ids.join(',')});
      queue = (videos.items || []).map(video=>({
        id:video.id,
        context:[video.snippet?.title,video.snippet?.description].filter(Boolean).join('\n').slice(0,12000),
        pageToken:'', received:0, replies:[],
      }));
    }
    while (queue.length && requests < 12 && Date.now()+6000 < deadline) {
      const video = queue[0];
      const sourceUrl = `https://www.youtube.com/watch?v=${video.id}`;
      const reply = video.replies[0];
      const pageToken = reply ? reply.pageToken : video.pageToken;
      try {
        const result = await call(reply ? 'comments' : 'commentThreads',{
          part:'snippet', ...(reply ? {parentId:reply.id} : {videoId:video.id,order:'time'}),
          maxResults:100,textFormat:'plainText',...(pageToken ? {pageToken} : {}),
        });
        const items = result.items || [];
        const rows = [];
        for (const item of items) {
          const comment = reply ? item : item.snippet?.topLevelComment;
          const snippet = comment?.snippet;
          if (!comment?.id) continue;
          if (!reply && item.snippet.totalReplyCount > 0) video.replies.push({id:comment.id,pageToken:''});
          if (!snippet?.authorDisplayName || !snippet.authorChannelUrl) continue;
          rows.push({text:snippet.textOriginal || snippet.textDisplay,name:snippet.authorDisplayName,
            authorUrl:snippet.authorChannelUrl,sourceUrl:`${sourceUrl}&lc=${encodeURIComponent(comment.id)}`,
            publishedAt:snippet.publishedAt,platform:'youtube',context:video.context,
            contextUrl:sourceUrl,collector:'YouTube Data API v3 — comentário público'});
        }
        for (const record of socialEvidence(rows,input)) records.set(record.key,record);
        video.received += items.length;
        if (reply) {
          if (result.nextPageToken) reply.pageToken = result.nextPageToken;
          else video.replies.shift();
        } else {
          video.pageToken = result.nextPageToken || '';
          video.threadsComplete = !result.nextPageToken;
        }
        if (video.threadsComplete && !video.replies.length) {
          reports.push({source:'YouTube API',url:sourceUrl,status:'collected',received:video.received});
          queue.shift();
        }
      } catch (error) {
        reports.push({source:'YouTube API',url:sourceUrl,status:'blocked',received:video.received,reason:error.message});
        queue.shift();
      }
    }
  } catch (error) {reports.push({source:'YouTube API',status:'failed',reason:error.message});}
  return {records:[...records.values()],reports,requests,pending:queue};
}
