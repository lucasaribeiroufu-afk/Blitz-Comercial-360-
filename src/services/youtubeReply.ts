import {GoogleAuthProvider, reauthenticateWithPopup} from 'firebase/auth';
import {auth} from '../lib/firebase';
import {youtubeReplyTarget} from '../utils/wayborReply';

async function youtubeRequest<T>(authorization: string, endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`https://www.googleapis.com/youtube/v3/${endpoint}`, {
    ...options,
    headers:{Authorization:`Bearer ${authorization}`, ...(options?.body ? {'Content-Type':'application/json'} : {})},
    redirect:'error',
    signal:AbortSignal.timeout(15000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`YouTube recusou a operação (HTTP ${response.status}). Confira a conta, as permissões e a publicação.`);
  return result as T;
}

export async function connectYoutubeReply() {
  const user = auth.currentUser;
  if (!user) throw new Error('Entre no Blitz 360 para conectar o YouTube.');
  const provider = new GoogleAuthProvider();
  provider.addScope('https://www.googleapis.com/auth/youtube.force-ssl');
  provider.setCustomParameters({prompt:'consent'});
  const result = await reauthenticateWithPopup(user, provider);
  const accessToken = GoogleAuthProvider.credentialFromResult(result)?.accessToken;
  if (!accessToken) throw new Error('O Google não retornou a autorização para responder pelo YouTube.');
  const channels = await youtubeRequest<{items?:Array<{snippet?:{title?:string}}>}>(accessToken,'channels?part=snippet&mine=true');
  const channelTitle = channels.items?.[0]?.snippet?.title;
  if (!channelTitle) throw new Error('Esta conta Google precisa de um canal ativo no YouTube.');
  return {accessToken, uid:user.uid, channelTitle};
}

export async function sendYoutubeReply(connection: Awaited<ReturnType<typeof connectYoutubeReply>>, sourceUrl: string, draft: string) {
  if (auth.currentUser?.uid !== connection.uid) throw new Error('Reconecte a conta do YouTube.');
  const target = youtubeReplyTarget(sourceUrl);
  const textOriginal = draft.trim();
  if (!target || !textOriginal || textOriginal.length > 10000) throw new Error('Confira a publicação e o texto da resposta.');
  const lookup = await youtubeRequest<{items?:Array<{id:string; snippet?:{videoId?:string; parentId?:string}}>}>(
    connection.accessToken,`comments?part=snippet&id=${encodeURIComponent(target.commentId)}`,
  );
  const original = lookup.items?.find(item=>item.id === target.commentId);
  if (original?.snippet?.videoId !== target.videoId || original.snippet.parentId)
    throw new Error('Abra o comentário original para responder a esta publicação.');
  const posted = await youtubeRequest<{id?:string}>(connection.accessToken,'comments?part=snippet',{
    method:'POST',body:JSON.stringify({snippet:{parentId:target.commentId,textOriginal}}),
  });
  if (!posted.id) throw new Error('O YouTube não confirmou o envio. Confira o comentário original antes de tentar novamente.');
  return `https://www.youtube.com/watch?v=${target.videoId}&lc=${encodeURIComponent(posted.id)}`;
}
