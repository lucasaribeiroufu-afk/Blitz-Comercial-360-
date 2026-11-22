import {useEffect, useState, type FormEvent} from 'react';
import {ativaApi} from '../services/ativaApi';

type Source = {url:string; label:string; keywords:string};
type RecordRow = {key:string; name:string; recordType:string; intent?:string; profileUrl:string;
  phone?:string; email?:string; publishedAt?:string; location?:string; proposalDeadline?:string;
  evidence?:Record<string,{excerpt?:string; sourceUrl?:string}>};
type Job = {id:string; status:string; input:{query:string; location:string}; records:RecordRow[];
  report?:{state:string; reports:Array<{url?:string; source?:string; status:string; reason?:string}>}; error?:string};
const inputClass = 'w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white';
const buttonClass = 'rounded-lg bg-teal-500 px-4 py-2.5 text-sm font-semibold text-zinc-950 disabled:opacity-50';
const label = (type:string) => ({purchase_mention:'Pedido publicado',potential_company:'Empresa potencial',
  region_unconfirmed:'Região pendente'}[type] || type);

export function AtivaPage() {
  const [query, setQuery] = useState('tinta impermeabilizante');
  const [location, setLocation] = useState('Uberlândia, MG');
  const [urls, setUrls] = useState('');
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
    const [catalog, history] = await Promise.all([ativaApi({action:'sources'}), ativaApi({action:'list'})]);
    setSources(catalog.sources); setDocuments(catalog.indexedDocuments); setJobs(history.jobs);
  }
  useEffect(() => {refresh().catch(err => setError(err.message));}, []);
  useEffect(() => {
    if (!active || !['queued','running'].includes(active.status)) return;
    let live = true;
    const timer = setTimeout(async () => {
      try {const job = await ativaApi({action:'get',id:active.id}); if (live) setActive(job);}
      catch (err:any) {if (live) {setError(err.message); setActive({...active});}}
    }, 4000);
    return () => {live = false; clearTimeout(timer);};
  }, [active]);
  async function execute(event:FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      const job = await ativaApi({action:'start', query, location, pncp:true,
        sources:urls.split('\n').map(url => url.trim()).filter(Boolean), requestKey:crypto.randomUUID()});
      setActive(await ativaApi({action:'get',id:job.id})); await refresh();
    } catch (err:any) {setError(err.message);} finally {setBusy(false);}
  }
  async function register(event:FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {await ativaApi({action:'addSource',source}); setSource({url:'',label:'',keywords:''}); await refresh();}
    catch (err:any) {setError(err.message);} finally {setBusy(false);}
  }
  async function save(row:RecordRow) {
    setSaving(row.key); setError('');
    try {await ativaApi({action:'saveToCrm',id:active!.id,keys:[row.key]}); setNotice(`${row.name} salvo no CRM com evidências.`);}
    catch (err:any) {setError(err.message);} finally {setSaving(null);}
  }
  return <section className="mx-auto max-w-7xl space-y-6 px-4 py-8 text-zinc-100 sm:px-6">
    <div><p className="text-sm font-semibold text-teal-400">Blitz Ativa</p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight">Fontes próprias e pedidos de compra</h1>
      <p className="mt-2 max-w-3xl text-sm text-zinc-400">Serper e Apify continuam na prospecção principal. Ao esgotar créditos ou orçamento, o coletor próprio assume nas fontes cadastradas e no PNCP. Você também pode iniciar uma coleta aqui.</p></div>
    {error && <div role="alert" className="rounded-lg border border-amber-800 bg-amber-950/30 p-4 text-sm text-amber-200">{error}</div>}
    {notice && <p role="status" className="rounded-lg bg-teal-950 p-3 text-sm text-teal-200">{notice}</p>}
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <section className="space-y-5 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
        <form onSubmit={execute} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1 text-sm">Produto<input className={inputClass} required maxLength={200} value={query} onChange={event=>setQuery(event.target.value)}/></label>
            <label className="space-y-1 text-sm">Região<input className={inputClass} required value={location} onChange={event=>setLocation(event.target.value)} placeholder="Brasil ou Cidade, UF"/></label>
          </div>
          <label className="block space-y-1 text-sm">URLs públicas adicionais<textarea className={inputClass} rows={3} value={urls} onChange={event=>setUrls(event.target.value)} placeholder="Uma URL HTTPS por linha. Páginas, feeds ou sitemap."/></label>
          <p className="text-xs text-zinc-400">O índice inclui {documents} documentos da sua conta. Correspondências de termos sugerem fontes para uma nova leitura.</p>
          <button className={buttonClass} disabled={busy}>Iniciar coleta própria</button>
        </form>
        {active && <div className="border-t border-zinc-800 pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">{active.input.query}</h2>
            <span className="text-sm text-teal-300">{active.status} {active.report?.state && `· ${active.report.state}`}</span></div>
          <p className="mt-1 text-sm text-zinc-400">{active.input.location}</p>
          {active.error && <p role="alert" className="mt-3 text-amber-300">{active.error}</p>}
          <button type="button" className="mt-3 text-sm text-teal-300 underline" onClick={()=>ativaApi({action:'get',id:active.id}).then(setActive).catch(err=>setError(err.message))}>Atualizar execução</button>
          {active.status === 'finished' && !active.records.length && <p className="mt-4 text-sm text-zinc-400">Esta execução não qualificou registros. Consulte as fontes e limitações abaixo.</p>}
          <div className="mt-4 space-y-3">{active.records.map(row=><article key={row.key} className="rounded-xl border border-zinc-700 p-4">
            <p className="text-xs font-semibold text-teal-300">{label(row.recordType)}</p><h3 className="mt-1 font-semibold">{row.name}</h3>
            <p className="mt-1 text-xs text-zinc-400">{row.location} {row.publishedAt && `· Publicado em ${new Date(row.publishedAt).toLocaleDateString('pt-BR')}`}</p>
            <p className="mt-3 whitespace-pre-wrap text-sm text-zinc-300">{row.intent || row.evidence?.name?.excerpt}</p>
            {(row.phone || row.email) && <p className="mt-2 text-sm">{[row.phone,row.email].filter(Boolean).join(' · ')}</p>}
            {row.proposalDeadline && <p className="mt-2 text-xs text-amber-200">Prazo publicado {new Date(row.proposalDeadline).toLocaleString('pt-BR')}</p>}
            <div className="mt-4 flex gap-4">{/^https:\/\//.test(row.profileUrl) && <a className="text-sm text-teal-300 underline" href={row.profileUrl} target="_blank" rel="noreferrer">Conferir fonte</a>}
              <button className="text-sm text-teal-300 disabled:text-zinc-500" disabled={saving !== null || row.recordType === 'region_unconfirmed'} onClick={()=>save(row)}>Salvar no CRM</button></div>
          </article>)}</div>
          {!!active.report?.reports?.length && <details className="mt-5 text-sm"><summary className="cursor-pointer text-zinc-300">Fontes, bloqueios e limites</summary>
            <ul className="mt-3 space-y-2">{active.report.reports.map((item,index)=><li key={index} className="break-words text-zinc-400">{item.url || item.source} · {item.status} {item.reason}</li>)}</ul></details>}
        </div>}
      </section>
      <aside className="space-y-5">
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
