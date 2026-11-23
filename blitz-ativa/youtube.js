import {socialEvidence} from './social.js';
import {productVariants} from '../src/server/purchaseIntent.js';

const searchPageSize = 50;
const searchPageBudget = 4;

export function youtubeVideoId(raw) {
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
    requests++;
    const response = await fetcher(url,{headers:{'X-Goog-Api-Key':youtubeKey},redirect:'error',
      signal:AbortSignal.timeout(Math.max(1,Math.min(6000,deadline-Date.now())))});
    if (!response.ok) {
      const failure = await response.json().catch(()=>null);
      const reason = failure?.error?.errors?.[0]?.reason;
      throw Error(`YouTube API HTTP ${response.status}${/^[a-zA-Z]+$/.test(reason || '') ? ` (${reason})` : ''}`);
    }
    const body = await response.text();
    if (body.length > 1200000) throw Error('Resposta YouTube excede limite.');
    return JSON.parse(body);
  }
  try {
    if (!pending) {
      const explicitIds = [...new Set(input.sources.map(youtubeVideoId).filter(Boolean))];
      const videos = new Map();
      if (explicitIds.length) {
        const result = await call('videos',{part:'snippet',id:explicitIds.join(',')});
        for (const item of result.items || []) videos.set(item.id,item.snippet);
        for (const id of explicitIds.filter(id=>!videos.has(id))) {
          reports.push(youtubeReport({id},'unavailable','Vídeo indisponível pela API.'));
        }
      }
      const discoverVideos = input.discover !== false && (input.wide || !explicitIds.length);
      if (discoverVideos) {
        const alternative = [...(input.alternatives || []),...productVariants(input.query)]
          .find(term=>term.toLowerCase() !== input.query.toLowerCase());
        const searches = [
          {q:input.query,order:'relevance'},
          {q:input.query,order:'date'},
          {q:alternative || `${input.query} orçamento`,order:'relevance'},
        ];
        let pages = 0;
        let failure = '';
        try {
          for (const search of searches) {
            if (Date.now()+10000 >= deadline) break;
            const {nextPageToken,...criteria} = search;
            const result = await call('search',{
              part:'snippet',type:'video',maxResults:searchPageSize,regionCode:'BR',relevanceLanguage:'pt',safeSearch:'moderate',
              ...criteria,...(nextPageToken ? {pageToken:nextPageToken} : {}),
            });
            pages++;
            for (const item of result.items || []) {
              const id = item.id?.videoId;
              if (/^[\w-]{11}$/.test(id || '') && !videos.has(id)) videos.set(id,item.snippet);
            }
            if (result.nextPageToken && searches.length < searchPageBudget) {
              searches.push({...criteria,nextPageToken:result.nextPageToken});
            }
          }
        } catch (error) {failure = error.message;}
        const incomplete = failure || pages < searches.length;
        reports.push({source:'Descoberta YouTube',status:incomplete ? 'limited' : 'collected',
          reason:`${videos.size} vídeos únicos na fila · ${pages} páginas consultadas na API.${failure ? ` ${failure}` : incomplete ? ' Busca encerrada pela janela de execução.' : ''}`});
      }
      queue = [...videos].map(([id,snippet])=>({
        id,
        context:[snippet?.title,snippet?.description?.slice(0,900)].filter(Boolean).join('\n'),
        pageToken:'', received:0, evaluated:0, qualified:0, replyCount:0, replies:[],
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
          if (!snippet?.authorDisplayName || !(snippet.textOriginal || snippet.textDisplay)?.trim()) continue;
          rows.push({text:snippet.textOriginal || snippet.textDisplay,name:snippet.authorDisplayName,
            authorUrl:snippet.authorChannelUrl,sourceUrl:`${sourceUrl}&lc=${encodeURIComponent(comment.id)}`,
            publishedAt:snippet.publishedAt,platform:'youtube',context:video.context,
            contextUrl:sourceUrl,collector:'YouTube Data API v3 — comentário público'});
        }
        const qualified = socialEvidence(rows,input);
        for (const record of qualified) records.set(record.key,record);
        video.received += items.length;
        video.evaluated = (video.evaluated || 0) + rows.length;
        video.qualified = (video.qualified || 0) + qualified.length;
        video.replyCount = (video.replyCount || 0) + (reply ? items.length : 0);
        video.retries = 0;
        if (reply) {
          if (result.nextPageToken) reply.pageToken = result.nextPageToken;
          else video.replies.shift();
        } else {
          video.pageToken = result.nextPageToken || '';
          video.threadsComplete = !result.nextPageToken;
        }
        if (video.threadsComplete && !video.replies.length) {
          reports.push(youtubeReport(video,'complete'));
          queue.shift();
        } else if (!video.replies.length) {
          // Give other videos a turn once replies for this page have been processed.
          queue.push(queue.shift());
        }
      } catch (error) {
        if ((error.name === 'TimeoutError' || /HTTP 5\d\d/.test(error.message)) && (video.retries || 0) < 2) {
          video.retries = (video.retries || 0) + 1;
          break;
        }
        reports.push(youtubeReport(video,'blocked',error.message));
        queue.shift();
      }
    }
  } catch (error) {reports.push({source:'YouTube API',status:'failed',reason:error.message});}
  return {records:[...records.values()],reports,requests,pending:queue};
}

export function youtubeReport(video, status, reason) {
  return {source:'YouTube API',url:`https://www.youtube.com/watch?v=${video.id}`,status,
    received:video.received || 0,evaluated:video.evaluated || 0,qualified:video.qualified || 0,
    replyCount:video.replyCount || 0,...(reason ? {reason} : {})};
}
