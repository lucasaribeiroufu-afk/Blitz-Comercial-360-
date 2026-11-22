import {useEffect, useState, type FormEvent} from 'react';
import {ativaApi} from '../services/ativaApi';

type Source = {url:string; label:string; keywords:string};
type RecordRow = {key:string; name:string; recordType:string; intent?:string; profileUrl:string; authorProfileUrl?:string;
  entityType?:string; platform?:string; phone?:string; email?:string; publishedAt?:string; location?:string; proposalDeadline?:string;
  reviewRequired?:boolean; evidence?:Record<string,{excerpt?:string; sourceUrl?:string}>};
type Job = {id:string; status:string; input:{query:string; location:string}; progress?:{pages:number;batches:number;pending:string[]}; records:RecordRow[];
  report?:{state:string; coverage?:string; discovery?:{coverage?:string;candidates:Array<{url:string;title:string;purpose:string}>}; reports:Array<{url?:string; source?:string; status:string; reason?:string; query?:string; received?:number}>}; error?:string};
const inputClass = 'w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white';
const buttonClass = 'rounded-lg bg-teal-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 disabled:opacity-50';
const label = (type:string) => ({purchase_mention:'Pedido publicado',potential_company:'Empresa potencial', past_purchase:'Compra passada', positive_experience:'Experiência positiva', negative_experience:'Experiência negativa', price_question:'Pergunta sobre preço',
  region_unconfirmed:'Região pendente'}[type] || type);

export function AtivaPage() {
  const [query, setQuery] = useState('tinta impermeabilizante');
  const [location, setLocation] = useState('Uberlândia, MG');
  const [audience, setAudience] = useState('both');
  const [wide, setWide] = useState(true);
  const [capabilities, setCapabilities] = useState<any>(null);
  const [intervalMinutes,setIntervalMinutes] = useState(60);
  const [watchEnabled,setWatchEnabled] = useState(false);
  const [watchConfigured,setWatchConfigured] = useState(false);
  const [urls, setUrls] = useState('');
  const [alternatives, setAlternatives] = useState('');
  const [sources, setSources] = useState<Source[]>([]);
  const [source, setSource] = useState<Source>({url:'',label:'',keywords:''});
  const [jobs, setJobs] = useState<Array<{id:string;status:string;input:Job['input']}>>([]);
  const [active, setActive] = useState<Job|null>(null);
  const [documents, setDocuments] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState<string|null>(null);
  async function refresh() {
    const [catalog, history, status, watch] = await Promise.all([ativaApi({action:'sources'}), ativaApi({action:'list'}),ativaApi({action:'status'}),ativaApi({action:'schedule'})]);
    setWatchConfigured(watch.configured);
    if(watch.schedule){setIntervalMinutes(watch.schedule.intervalMinutes);setWatchEnabled(watch.schedule.enabled);}
    setCapabilities(status);
    setSources(catalog.sources); setDocuments(catalog.indexedDocuments); setJobs(history.jobs);
  }
  useEffect(() => {refresh().catch(err => setError(err.message));}, []);
  useEffect(() => {
    if (!active || !['queued','running','waiting'].includes(active.status)) return;
    let live = true;
    const timer = setTimeout(async () => {
      try {const job = await ativaApi({action:active.status === 'waiting' ? 'continue' : 'get',id:active.id}); if (live) setActive(job);}
      catch (err:any) {if (live) {setError(err.message); setActive({...active});}}
    }, 4000);
    return () => {live = false; clearTimeout(timer);};
  }, [active]);
  async function execute(event:FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      const job = await ativaApi({action:'start', query, location, audience, alternatives:alternatives.split('\n').map(term=>term.trim()).filter(Boolean), pncp:audience !== 'b2c', discover:true, wide,
        sources:urls.split('\n').map(url => url.trim()).filter(Boolean), requestKey:crypto.randomUUID()});
      setActive(await ativaApi({action:'get',id:job.id})); await refresh();
    } catch (err:any) {setError(err.message);} finally {setBusy(false);}
  }
  async function register(event:FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {await ativaApi({action:'addSource',source}); setSource({url:'',label:'',keywords:''}); await refresh();}
    catch (err:any) {setError(err.message);} finally {setBusy(false);}
  }
  async function saveWatch(event:FormEvent) {
    event.preventDefault();setBusy(true);setError('');
    try {
      const result=await ativaApi({action:'saveSchedule',query,location,audience,
        alternatives:alternatives.split('\n').map(term=>term.trim()).filter(Boolean),
        sources:urls.split('\n').map(url=>url.trim()).filter(Boolean),intervalMinutes,enabled:watchEnabled});
      setWatchConfigured(result.configured);
      setNotice(result.configured ? 'Rotina salva. A execução depende do acionamento periódico do executor.' : 'Rotina salva. Falta configurar a credencial e a frequência do executor em segundo plano.');
    }catch(err:any){setError(err.message);}finally{setBusy(false);}
  }
  async function save(row:RecordRow) {
    setSaving(row.key); setError('');
    try {await ativaApi({action:'saveToCrm',id:active!.id,keys:[row.key]}); setNotice(`${row.name} salvo no CRM com evidências.`);}
    catch (err:any) {setError(err.message);} finally {setSaving(null);}
  }
  const youtubeSignals = active?.records.filter(row=>row.platform === 'youtube') || [];
  const youtubeCandidate = youtubeSignals.find(row=>row.recordType === 'purchase_mention')
    || youtubeSignals.find(row=>row.recordType === 'price_question');

  return <section className="mx-auto max-w-7xl space-y-6 px-4 py-8 text-zinc-100 sm:px-6">
    <div><p className="text-sm font-semibold text-teal-400">Blitz Ativa</p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight">Fontes próprias e pedidos de compra</h1>
      <p className="mt-2 max-w-3xl text-sm text-zinc-400">Digite o produto e a região para descobrir fontes automaticamente. A coleta ampla avança em lotes retomáveis e salva o histórico e as fontes consultadas. A cobertura depende do índice de descoberta e do acesso oferecido por cada site.</p></div>
    {error && <div role="alert" className="rounded-lg border border-amber-800 bg-amber-950/30 p-4 text-sm text-amber-200">{error}</div>}
    {notice && <p role="status" className="rounded-lg bg-teal-950 p-3 text-sm text-teal-200">{notice}</p>}
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <section className="space-y-5 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
        <form onSubmit={execute} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1 text-sm">Produto<input className={inputClass} required maxLength={200} value={query} onChange={event=>setQuery(event.target.value)}/></label>
            <label className="space-y-1 text-sm">Região<input className={inputClass} required value={location} onChange={event=>setLocation(event.target.value)} placeholder="Brasil ou Cidade, UF"/></label>
          </div>
          <label className="block space-y-1 text-sm">Público<select className={inputClass} value={audience} onChange={event=>setAudience(event.target.value)}><option value="both">Empresas e pessoas físicas</option><option value="b2b">Empresas</option><option value="b2c">Pessoas físicas</option></select></label>
          <p className="text-xs text-zinc-400">O motor procura fontes sobre o produto e candidatos a concorrentes. Comentários com autor e data podem usar o contexto da publicação original. Fontes adicionais são opcionais.</p>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={wide} onChange={event=>setWide(event.target.checked)}/>Coleta ampla em lotes</label>
          {wide && <p className="text-xs text-zinc-400">Até 120 páginas e 10 lotes. Mantenha esta página aberta para continuar a fila automaticamente. A coleta pode ser retomada no histórico.</p>}
          {capabilities && <p className="text-xs text-zinc-400">Conexões configuradas · SearXNG {capabilities.searxConfigured ? "sim" : "pendente"} · Worker social {capabilities.socialConfigured ? "sim" : "pendente"} · YouTube API {capabilities.youtubeConfigured ? "sim" : "pendente"}. Acesso e cobertura são verificados a cada coleta.</p>}
          <label className="block space-y-1 text-sm">Produtos alternativos e soluções semelhantes<textarea className={inputClass} rows={3} value={alternatives} onChange={event=>setAlternatives(event.target.value)} placeholder="Um termo por linha. Exemplo para antiderrapante: tapete de borracha"/></label>
          <label className="block space-y-1 text-sm">URLs públicas adicionais (opcional)<textarea className={inputClass} rows={3} value={urls} onChange={event=>setUrls(event.target.value)} placeholder="Uma URL HTTPS por linha. Páginas, feeds ou sitemap."/></label>
          <a className="block text-sm text-teal-300 underline" href={`https://www.google.com/search?q=${encodeURIComponent(`site:reclameaqui.com.br "${query}" ${location === 'Brasil' ? '' : location} ("não resolvido" OR "não respondida" OR "sem solução")`)}`} target="_blank" rel="noreferrer">Descobrir reclamações públicas no Reclame Aqui</a>
          <p className="text-xs text-zinc-400">O índice inclui {documents} documentos da sua conta. Fontes descobertas ficam registradas no relatório de cada execução.</p>
          <button className={buttonClass} disabled={busy}>Iniciar coleta própria</button>
        </form>
        {active && <div className="border-t border-zinc-800 pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">{active.input.query}</h2>
            <span className="text-sm text-teal-300">{active.status} {active.report?.state && `· ${active.report.state}`}</span></div>
          <p className="mt-1 text-sm text-zinc-400">{active.input.location}</p>
          {active.progress && <p className="mt-1 text-xs text-zinc-400">{active.progress.pages} páginas processadas · {active.progress.batches} lotes · {active.progress.pending.length} fontes na fila</p>}
          {active.report?.coverage && <p className="mt-2 text-xs text-zinc-400">{active.report.coverage}</p>}
          {active.report?.discovery?.coverage && <p className="mt-2 text-xs text-zinc-400">{active.report.discovery.coverage}</p>}
          {!!active.report?.discovery?.candidates.length && <details className="mt-3 text-sm"><summary>Fontes descobertas ({active.report.discovery.candidates.length})</summary><ul className="mt-2 space-y-2">{active.report.discovery.candidates.map(item=><li key={item.url}><a href={item.url} target="_blank" rel="noreferrer" className="text-teal-300 underline">{item.title || item.url}</a><span className="block text-xs text-zinc-400">Candidato para leitura · {item.purpose}</span></li>)}</ul></details>}
          {active.error && <p role="alert" className="mt-3 text-amber-300">{active.error}</p>}
          <button type="button" className="mt-3 text-sm text-teal-300 underline" onClick={()=>ativaApi({action:'get',id:active.id}).then(setActive).catch(err=>setError(err.message))}>Atualizar execução</button>
          {active.status === 'finished' && !active.records.length && <p className="mt-4 text-sm text-zinc-400">Esta execução não qualificou registros. Consulte as fontes e limitações abaixo.</p>}
          <div className="mt-4 space-y-3">{active.records.map(row=><article key={row.key} className="rounded-xl border border-zinc-700 p-4">
            {row.key === youtubeCandidate?.key && <p className="mb-2 text-xs font-semibold text-teal-300">Comentário do YouTube para revisar primeiro</p>}
            <p className="text-xs font-semibold text-teal-300">{label(row.recordType)}{row.entityType === 'pf' ? ' · Pessoa física' : ''}{row.platform && ` · ${row.platform}`}</p><h3 className="mt-1 font-semibold">{row.name}</h3>
            <p className="mt-1 text-xs text-zinc-400">{row.location} {row.publishedAt && `· Publicado em ${new Date(row.publishedAt).toLocaleDateString('pt-BR')}`}</p>
            <p className="mt-3 whitespace-pre-wrap text-sm text-zinc-300">{row.intent || row.evidence?.name?.excerpt}</p>
            {row.reviewRequired && <div className="mt-2 rounded-lg border border-amber-800 p-3 text-xs text-amber-200"><p>Interpretação contextual. Revise a publicação e o comentário antes de abordar.</p><p className="mt-2 whitespace-pre-wrap">{row.evidence?.context?.excerpt}</p></div>}
            {(row.phone || row.email) && <p className="mt-2 text-sm">{[row.phone,row.email].filter(Boolean).join(' · ')}</p>}
            {row.proposalDeadline && <p className="mt-2 text-xs text-amber-200">Prazo publicado {new Date(row.proposalDeadline).toLocaleString('pt-BR')}</p>}
            <div className="mt-4 flex gap-4">{/^https:\/\//.test(row.profileUrl) && <a className="text-sm text-teal-300 underline" href={row.profileUrl} target="_blank" rel="noreferrer">{row.platform === 'youtube' ? 'Ver comentário' : 'Conferir fonte'}</a>}
              {row.platform === 'youtube' && /^https:\/\//.test(row.authorProfileUrl || '') && <a className="text-sm text-teal-300 underline" href={row.authorProfileUrl} target="_blank" rel="noreferrer">Canal do autor</a>}
              <button className="text-sm text-teal-300 disabled:text-zinc-500" disabled={saving !== null || !['purchase_mention','potential_company'].includes(row.recordType)} onClick={()=>save(row)}>Salvar no CRM</button></div>
          </article>)}</div>
          {!!active.report?.reports?.length && <details className="mt-5 text-sm"><summary className="cursor-pointer text-zinc-300">Fontes, bloqueios e limites</summary>
            <ul className="mt-3 space-y-2">{active.report.reports.map((item,index)=><li key={index} className="break-words text-zinc-400">{item.url || item.source} · {item.status} {item.reason}{item.query && <span className="block text-xs">{item.query}</span>}{item.received !== undefined && <span className="block text-xs">{item.received} itens retornados</span>}</li>)}</ul></details>}
        </div>}
      </section>
      <aside className="space-y-5">
        <section className="rounded-2xl border border-zinc-800 p-5"><h2 className="font-semibold">Monitoramento em segundo plano</h2>
          <p className="mt-2 text-xs text-zinc-400">Salva o produto, público e região acima. Credencial do executor {watchConfigured ? 'configurada' : 'pendente'}. A periodicidade do executor é configurada na hospedagem.</p>
          <form onSubmit={saveWatch} className="mt-4 space-y-3">
            <label className="block space-y-1 text-sm">Intervalo entre buscas (minutos)<input type="number" min={15} max={10080} required className={inputClass} value={intervalMinutes} onChange={event=>setIntervalMinutes(Number(event.target.value))}/></label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={watchEnabled} onChange={event=>setWatchEnabled(event.target.checked)}/>Ativar rotina</label>
            <button className={buttonClass} disabled={busy}>Salvar rotina</button>
          </form>
        </section>
        <section className="rounded-2xl border border-zinc-800 p-5"><h2 className="font-semibold">Execuções da sua conta</h2>
          <button className="mt-2 text-sm text-teal-300" onClick={()=>refresh().catch(err=>setError(err.message))}>Atualizar histórico</button>
          <ul className="mt-3 space-y-2">{jobs.map(job=><li key={job.id}><button className="w-full rounded-lg bg-zinc-900 p-3 text-left text-sm" onClick={()=>ativaApi({action:'get',id:job.id}).then(setActive).catch(err=>setError(err.message))}>{job.input.query}<span className="mt-1 block text-xs text-zinc-400">{job.input.location} · {job.status}</span></button></li>)}</ul>
        </section>
        <section className="rounded-2xl border border-zinc-800 p-5"><h2 className="font-semibold">Cadastrar fonte pública</h2>
          <form onSubmit={register} className="mt-4 space-y-3">
            <label className="block space-y-1 text-sm">Nome<input className={inputClass} required value={source.label} onChange={event=>setSource({...source,label:event.target.value})}/></label>
            <label className="block space-y-1 text-sm">URL HTTPS<input type="url" className={inputClass} required value={source.url} onChange={event=>setSource({...source,url:event.target.value})}/></label>
            <label className="block space-y-1 text-sm">Produtos e termos<input className={inputClass} required value={source.keywords} onChange={event=>setSource({...source,keywords:event.target.value})}/></label>
            <button className={buttonClass} disabled={busy}>Salvar fonte</button>
          </form>
          <ul className="mt-4 space-y-2 text-sm text-zinc-400">{sources.map(item=><li key={item.url} className="break-words">{item.label}<span className="block text-xs">{item.url}</span></li>)}</ul>
        </section>
      </aside>
    </div>
  </section>;
}
