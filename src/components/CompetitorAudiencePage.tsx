import {useState, type FormEvent} from 'react';
import {searchB2CLeads} from '../services/extractionService';
import {mutateCrm} from '../services/crmApi';
import {ProspectingProjects, type ProspectingSetup} from './ProspectingProjects';
import {RadarExecutionReport} from './RadarExecutionReport';
import type {ExtractedResult, ExecutionReport} from '../types';

const field = 'w-full rounded-lg border border-zinc-700 bg-zinc-950 p-3 text-white';
export function CompetitorAudiencePage({userId}:{userId:string}) {
  const [product,setProduct] = useState('');
  const [location,setLocation] = useState('Brasil');
  const [segment,setSegment] = useState('');
  const [links,setLinks] = useState('');
  const [busy,setBusy] = useState(false);
  const [notice,setNotice] = useState('');
  const [rows,setRows] = useState<ExtractedResult[]>([]);
  const [report,setReport] = useState<ExecutionReport>();
  const setup:ProspectingSetup = {product,location,segment,sourceLinks:links,mode:'b2c',sectors:'',audience:'both',count:10,objective:'Pedidos públicos em publicações de concorrentes',objectiveCustom:true,marketplaces:false};
  const load = (value:ProspectingSetup) => {
    setProduct(value.product);setLocation(value.location);setSegment(value.segment);setLinks(value.sourceLinks);
  };
  async function collect(event:FormEvent) {
    event.preventDefault();setBusy(true);setNotice('Consultando fontes públicas...');setRows([]);setReport(undefined);
    try {
      const urls = links.split('\n').map(value=>value.trim()).filter(Boolean);
      const result = await searchB2CLeads(product,location,10,urls,setNotice,false,
        value=>setReport(value),{segment});
      setRows(result.leads);setNotice(result.meta?.summary || 'Execução concluída. Confira as evidências e os limites.');
    } catch (error) {setNotice(error instanceof Error ? error.message : 'Falha de coleta.');}
    finally {setBusy(false);}
  }
  async function save(row:ExtractedResult) {
    setBusy(true);
    try {await mutateCrm(userId,{action:'saveContacts',contacts:[row]});setNotice(`${row.name} salvo no CRM com a publicação.`);}
    catch (error) {setNotice(error instanceof Error ? error.message : 'Falha ao salvar.');}
    finally {setBusy(false);}
  }
  const search = (site:string) => `https://www.google.com/search?q=${encodeURIComponent(`site:${site} "${product}" ${segment} ${location === 'Brasil' ? '' : location}`)}`;
  return <section className="mx-auto max-w-6xl space-y-6 px-4 py-8 text-zinc-100">
    <h1 className="text-3xl font-semibold">Públicos de concorrentes</h1>
    <p className="text-sm text-zinc-400">Localize publicações de marcas e soluções semelhantes e analise pedidos públicos nos comentários. Os resultados preservam a evidência e a região informada pelo autor.</p>
    <ProspectingProjects userId={userId} setup={setup} busy={busy} onLoad={load}/>
    <form className="space-y-4 rounded-xl border border-zinc-800 p-5" onSubmit={collect}>
      <label className="block">Produto<input required maxLength={200} className={field} value={product} disabled={busy} onChange={e=>setProduct(e.target.value)}/></label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label>Região<input required maxLength={160} className={field} value={location} disabled={busy} onChange={e=>setLocation(e.target.value)}/></label>
        <label>Nicho ou aplicação<input maxLength={80} className={field} value={segment} disabled={busy} onChange={e=>setSegment(e.target.value)} placeholder="Exemplo: instalações rurais"/></label>
      </div>
      {product.trim() && <div className="flex flex-wrap gap-4 text-sm text-teal-300">{['instagram.com','facebook.com/groups','tiktok.com','reclameaqui.com.br'].map(site=><a key={site} href={search(site)} target="_blank" rel="noreferrer" className="underline">Pesquisar {site}</a>)}</div>}
      <label className="block">Publicações para analisar<textarea className={field} rows={4} value={links} disabled={busy} onChange={e=>setLinks(e.target.value)} placeholder="Até 9 URLs públicas de posts, reels, grupos, vídeos ou páginas. Uma por linha."/></label>
      <p className="text-xs text-zinc-400">Os atalhos abrem uma pesquisa manual. A coleta usa os conectores configurados e apresenta seus bloqueios e limites. Experiências e alternativas podem ser revisadas no Blitz Ativa.</p>
      <button disabled={busy} className="rounded-lg bg-teal-500 px-5 py-3 font-semibold text-zinc-950 disabled:opacity-50">{busy ? 'Processando' : 'Analisar pedidos públicos'}</button>
    </form>
    {notice && <p role="status" className="rounded-lg border border-zinc-700 p-4 text-sm">{notice}</p>}
    {report && <RadarExecutionReport report={report}/>}
    <div className="space-y-3">{rows.map((row,index)=><article key={`${row.profileUrl}-${index}`} className="rounded-xl border border-zinc-700 p-5">
      <h2 className="font-semibold">{row.name}</h2><p className="text-xs text-zinc-400">{row.platform} · {row.location} · {row.publishedAt}</p>
      <p className="my-3 whitespace-pre-wrap text-sm">{row.intent}</p>
      <div className="flex gap-4 text-sm text-teal-300">{/^https:\/\//.test(row.profileUrl) && <a href={row.profileUrl} target="_blank" rel="noreferrer" className="underline">Ver publicação</a>}
        <button disabled={busy} onClick={()=>save(row)}>Salvar no CRM</button></div>
    </article>)}</div>
    <details className="rounded-xl border border-zinc-800 p-4 text-sm text-zinc-400"><summary>Ferramenta mostrada no vídeo</summary>
      <p className="mt-3">O vídeo usa Mailerfind conectado ao Claude. A conexão externa ainda exige conta, autorização e créditos do Mailerfind.</p>
      <a className="mt-2 inline-block text-teal-300 underline" href="https://help.mailerfind.com/pt-br/article/conecte-o-mailerfind-ao-claude-wunaig/" target="_blank" rel="noreferrer">Documentação do fornecedor</a>
    </details>
  </section>;
}
