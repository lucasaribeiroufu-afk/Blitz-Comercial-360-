import {useRef, useState} from 'react';
import {auth} from '../lib/firebase';
import {connectYoutubeReply, sendYoutubeReply} from '../services/youtubeReply';
import {wayborReply, youtubeReplyTarget} from '../utils/wayborReply';

type ReplyProps = {name:string; product:string; category:string; comment:string; sourceUrl:string};
type Decision = {kind:'discarded'} | {kind:'sent'; url:string};

export function CommentReplyReview({name,product,category,comment,sourceUrl}:ReplyProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const youtubeTarget = youtubeReplyTarget(sourceUrl);
  const identity = youtubeTarget ? `${youtubeTarget.videoId}:${youtubeTarget.commentId}` : sourceUrl;
  const storageKey = `blitz-reply:${auth.currentUser?.uid || ''}:${identity}`;
  const [decision,setDecision] = useState<Decision|null>(null);
  const [draft,setDraft] = useState('');
  const [notice,setNotice] = useState('');
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const [connection,setConnection] = useState<Awaited<ReturnType<typeof connectYoutubeReply>>|null>(null);

  function persist(result: Decision) {
    setDecision(result);
    try {localStorage.setItem(storageKey,JSON.stringify(result));} catch { /* The current view still retains the decision. */ }
  }

  function openReview() {
    setError('');
    setNotice('');
    try {
      const prior = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (prior?.kind === 'discarded' || (prior?.kind === 'sent' && youtubeReplyTarget(prior.url))) setDecision(prior);
    } catch { /* Keep review available if local storage is unavailable. */ }
    setDraft(wayborReply({name,product,category,comment}));
    dialog.current?.showModal();
  }

  async function authorize() {
    setBusy(true);setError('');
    try {setConnection(await connectYoutubeReply());}
    catch {setError('Não foi possível autorizar o YouTube nesta conta. Você pode copiar o rascunho e responder na publicação original.');}
    finally {setBusy(false);}
  }

  async function send() {
    if (busy || decision || !connection) return;
    setBusy(true);setError('');
    try {persist({kind:'sent',url:await sendYoutubeReply(connection,sourceUrl,draft)});}
    catch (failure) {
      setConnection(null);
      setError(`${failure instanceof Error ? failure.message : 'O YouTube não confirmou o envio.'} Confira o comentário original antes de repetir.`);
    } finally {setBusy(false);}
  }

  async function copy() {
    setError('');
    try {await navigator.clipboard.writeText(draft.trim());setNotice('Rascunho copiado. Cole e revise a resposta na publicação original antes de enviar.');}
    catch {setError('Selecione e copie manualmente o texto do rascunho.');}
  }

  return <>
    <button type="button" className="text-sm text-teal-300 underline" onClick={openReview}>Revisar resposta Waybor</button>
    <dialog ref={dialog} aria-label="Revisar resposta Waybor" onCancel={event=>{if (busy) event.preventDefault();}}
      className="m-auto w-[min(92vw,38rem)] rounded-xl border border-zinc-700 bg-zinc-900 p-5 text-zinc-100 backdrop:bg-black/70">
      <h2 className="text-lg font-semibold">Resposta Waybor para {name}</h2>
      <blockquote className="mt-3 whitespace-pre-wrap rounded-lg bg-zinc-950 p-3 text-sm text-zinc-300">{comment}</blockquote>
      {decision?.kind === 'sent' ? <p role="status" className="mt-3 text-teal-200">Resposta publicada. <a className="underline" href={decision.url} target="_blank" rel="noreferrer">Ver resposta</a></p>
      : decision?.kind === 'discarded' ? <p role="status" className="mt-3 text-zinc-300">Rascunho descartado. <button type="button" className="text-teal-300 underline" onClick={()=>{
        try {localStorage.removeItem(storageKey);} catch { /* Reopening is still possible in this view. */ }
        setDecision(null);
      }}>Gerar novamente</button></p> : <>
        <label className="mt-4 block space-y-1 text-sm">Rascunho editável
          <textarea className="block w-full rounded-lg border border-zinc-700 bg-zinc-950 p-3" rows={8} maxLength={10000}
            value={draft} disabled={busy} onChange={event=>setDraft(event.target.value)}/>
        </label>
        {youtubeTarget && <p className="mt-2 text-xs text-zinc-400">{connection
          ? `Enviar captura publica uma resposta pública pelo canal ${connection.channelTitle}.`
          : 'Autorize sua conta do YouTube para publicar uma resposta a partir do Blitz.'}</p>}
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          {youtubeTarget && (connection
            ? <button type="button" disabled={busy || !draft.trim()} className="rounded-lg bg-teal-500 px-3 py-2 font-semibold text-zinc-950 disabled:opacity-50" onClick={send}>Enviar captura</button>
            : <button type="button" disabled={busy} className="rounded-lg bg-teal-500 px-3 py-2 font-semibold text-zinc-950 disabled:opacity-50" onClick={authorize}>Conectar YouTube para enviar</button>)}
          <button type="button" disabled={busy || !draft.trim()} className="text-teal-300 underline" onClick={copy}>Copiar resposta</button>
          <a className="text-teal-300 underline" href={sourceUrl} target="_blank" rel="noreferrer">Abrir publicação original</a>
          <button type="button" disabled={busy} className="text-zinc-300 underline" onClick={()=>{setDraft('');persist({kind:'discarded'});}}>Descartar</button>
        </div>
      </>}
      {notice && <p role="status" className="mt-3 text-sm text-teal-200">{notice}</p>}
      {error && <p role="alert" className="mt-3 text-sm text-amber-200">{error}</p>}
      <button type="button" disabled={busy} className="mt-4 text-sm text-zinc-300 underline" onClick={()=>dialog.current?.close()}>Fechar</button>
    </dialog>
  </>;
}
