import { useState, type FormEvent } from "react";
import { api, send } from "../services/api";

type Lead = {
  sourceId: string;
  sourceUrl: string;
  name: string;
  excerpt: string;
  location: string;
  publishedAt: string;
  phone: string;
  email: string;
};
type Result = { id: string; leads: Lead[]; summary: string };
const field = "w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm";
const button = "rounded-xl border border-indigo-500 px-3 py-2 text-sm text-indigo-200 disabled:opacity-50";

export function DemandRadar({ product, region, onSaved }: {
  product: string;
  region: string;
  onSaved: () => Promise<void>;
}) {
  const [query, setQuery] = useState(product);
  const [location, setLocation] = useState(region);
  const [urls, setUrls] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState<string[]>([]);

  async function search(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    setSaved([]);
    setResult(null);
    try {
      setResult(await api<Result>("/api/demand", send("POST", {
        query, location, sourceUrls: urls.split(/\r?\n/).map((url) => url.trim()).filter(Boolean),
      })));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha na consulta.");
    } finally {
      setBusy(false);
    }
  }

  async function save(lead: Lead, runId: string) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const contact = await api<{ duplicate: boolean; archived: boolean }>("/api/contacts", send("POST", {
        demandRunId: runId, sourceId: lead.sourceId,
      }));
      setSaved((ids) => [...ids, lead.sourceId]);
      setMessage(contact.archived ? "O registro já está na carteira arquivada." :
        contact.duplicate ? "Publicação já registrada na carteira." : "Publicação registrada na carteira.");
      await onSaved();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao salvar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
      <h2 className="text-xl font-bold">Radar de demanda pública</h2>
      <p className="text-sm text-zinc-400">
        Pedidos publicados nos últimos 30 dias, com trecho, data e fonte. Confirme a disponibilidade com o autor antes de preparar uma proposta.
      </p>
      <form className="space-y-3" onSubmit={search}>
        <label className="block text-sm">Produto
          <input className={field} required maxLength={300} value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <label className="block text-sm">Região
          <input className={field} required maxLength={160} value={location} onChange={(e) => setLocation(e.target.value)} />
        </label>
        <label className="block text-sm">Links de fontes públicas, um por linha
          <textarea className={field} maxLength={4510} value={urls} onChange={(e) => setUrls(e.target.value)} />
        </label>
        <button className={button} disabled={busy}>{busy ? "Processando…" : "Consultar fontes públicas"}</button>
      </form>
      {message && <p role="status" className="text-sm text-amber-200">{message}</p>}
      {result && (
        <>
          <p className="text-sm text-zinc-300">
            {result.leads.length} publicação(ões) com data e fonte aceitas.
          </p>
          {result.summary && <p className="text-sm text-zinc-400">{result.summary}</p>}
          {result.leads.map((lead) => (
            <article key={lead.sourceId} className="space-y-2 rounded-xl border border-zinc-700 p-4">
              <h3 className="font-semibold">{lead.name}</h3>
              <p className="text-sm text-zinc-400">
                {new Date(lead.publishedAt).toLocaleDateString("pt-BR", { timeZone: lead.publishedAt.length === 10 ? "UTC" : "America/Sao_Paulo" })} · {lead.location}
              </p>
              <blockquote className="whitespace-pre-wrap text-sm">{lead.excerpt}</blockquote>
              {lead.phone && <p className="text-sm">Telefone publicado pelo autor: {lead.phone}</p>}
              {lead.email && <p className="text-sm">E-mail publicado pelo autor: {lead.email}</p>}
              <div className="flex flex-wrap items-center gap-3">
                <a className="text-sm underline" href={lead.sourceUrl} target="_blank" rel="noreferrer">Abrir fonte</a>
                <button className={button} disabled={busy || saved.includes(lead.sourceId)} onClick={() => save(lead, result.id)}>
                  {saved.includes(lead.sourceId) ? "Registrado" : "Salvar na carteira"}
                </button>
              </div>
            </article>
          ))}
        </>
      )}
    </section>
  );
}
