import type { Provenance } from '../types';
export function SourceEvidence({record}: {record: Provenance}) {
 const fields = Object.entries(record.evidence || {});
 if (!fields.length) return <p className="text-xs text-amber-400 mt-2">Sem proveniência de coleta. Dados não auditados.</p>;
 return <details className="text-xs text-zinc-400 mt-2 rounded border border-zinc-800 p-2">
  <summary className="cursor-pointer">Fontes e evidências ({fields.length} campos)</summary>
  {record.authorProfileUrl && /^https:\/\/(www\.)?(instagram|facebook|tiktok)\.com\//.test(record.authorProfileUrl) ? <p className="mt-2"><a href={record.authorProfileUrl} target="_blank" rel="noreferrer" className="text-sky-400 underline">Abrir perfil público do autor</a></p> : null}
  <p className="mt-2">Fonte observada; telefone ativo e compra atual não comprovados.</p>
  {record.companyContactLabel&&<p className="mt-2">{record.companyContactLabel}: telefone geral não atribuído a comprador.</p>}
  {!!record.corporateOfficers?.length&&<p className="mt-2">Sócios/administradores (QSA, não comprova função de compras): {record.corporateOfficers.map(p=>`${p.nome} (${p.qualificacao})`).join('; ')}</p>}
  {record.professionalContacts?.map((p,i)=><div key={i} className="mt-2 border-t border-zinc-800 pt-2"><strong>{p.name} — {p.role}</strong><p>Vínculo: {p.company} · Poder de compra não confirmado.</p><p>Telefone: {p.phone||'não publicado'} · Email: {p.email||'não publicado'} · Linha ativa/WhatsApp/titularidade não verificados.</p>{Object.entries(p.evidence).map(([field,e])=><p key={field}>{field}: {p.fieldStatus[field]} · <a href={/^https:\/\//.test(e.sourceUrl)?e.sourceUrl:undefined} target="_blank" rel="noreferrer" className="text-sky-400 underline">{e.sourceUrl}</a> · {e.retrievedAt}<br/>{e.excerpt}</p>)}</div>)}
  {fields.map(([field,e]) => <div key={field} className="mt-2 break-words">
   <strong>{field}</strong>: {typeof e.value === 'object' ? JSON.stringify(e.value) : String(e.value)}
   <br/><a className="text-sky-400 underline" href={/^https:\/\//.test(e.sourceUrl) ? e.sourceUrl : undefined} target="_blank" rel="noreferrer">{e.source}</a>
   <span> · Coletado em {e.retrievedAt}</span>
  </div>)}
 </details>;
}
