import { useEffect, useState, type ReactNode, type FormEvent } from "react";
import type { User } from "firebase/auth";
import { auth, onAuthStateChanged, logOut } from "./lib/firebase";
import { LoginScreen } from "./components/LoginScreen";
import { api, send, clearLegacyCache } from "./services/api";
import {
  calculatePrice,
  externalProposal,
  safeLink,
  stageLabels,
  whatsappLink,
  type Pricing,
} from "./utils/commercial";
import {
  Zap,
  Search,
  Database,
  ShieldCheck,
  ExternalLink,
  Phone,
  MessageCircle,
  Archive,
  RotateCcw,
  LogOut,
  X,
  FileText,
  Plus,
  Download,
  LoaderCircle,
} from "lucide-react";

const inputClass =
  "w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white outline-none focus:border-indigo-400";
const buttonClass =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-700 px-3 py-2 text-sm transition hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed";
const primaryClass = `${buttonClass} bg-indigo-600 border-indigo-500 hover:bg-indigo-500 text-white`;
const money = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const when = (v: any) =>
  v && Number.isFinite(new Date(v).getTime())
    ? new Date(v).toLocaleString("pt-BR")
    : "Não informada";
const activeRun = (r: any) =>
  r && !["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(r.status);
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-2 text-xs font-medium text-zinc-400">
      <span>{label}</span>
      {children}
    </label>
  );
}
function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <section className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-2xl border border-zinc-700 bg-zinc-900 p-5">
        <header className="mb-5 flex items-center justify-between gap-4">
          <h2 className="text-lg font-bold">{title}</h2>
          <button
            className={buttonClass}
            onClick={close}
            aria-label="Fechar janela"
          >
            <X size={18} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
function downloadCsv(contacts: any[]) {
  const cell = (v: any) => {
    let s = String(v ?? "");
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const rows = [
    [
      "Nome",
      "Telefone",
      "E-mail",
      "Localização",
      "Etapa",
      "Fonte",
      "Capturado em",
    ],
    ...contacts.map((c) => [
      c.name,
      c.phone,
      c.email,
      c.location,
      stageLabels[c.status],
      c.sourceUrl || (c.origin === "manual" ? "Manual" : "Não comprovada"),
      c.capturedAt ? when(c.capturedAt) : "",
    ]),
  ];
  const url = URL.createObjectURL(
    new Blob(["\uFEFF" + rows.map((r) => r.map(cell).join(";")).join("\r\n")], {
      type: "text/csv;charset=utf-8;",
    }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "blitz360-contatos.csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Proposal({ contact, close }: { contact: any; close: () => void }) {
  const [product, setProduct] = useState(contact.productContext || "");
  const [pricing, setPricing] = useState<Pricing>({
    cost: 0,
    shipping: 0,
    insurance: 0,
    taxes: 0,
    commission: 0,
    fees: 0,
    margin: 20,
    quantity: 1,
    mode: "CIF",
  });
  const [notice, setNotice] = useState("");
  let result: ReturnType<typeof calculatePrice> | null = null,
    proposal = "",
    error = "";
  try {
    result = calculatePrice(pricing);
    proposal = externalProposal(contact.name, product, pricing);
  } catch (e: any) {
    error = e.message;
  }
  const fields: [keyof Pricing, string][] = [
    ["cost", "Custo unitário interno (R$)"],
    ["shipping", "Frete unitário (R$)"],
    ["insurance", "Seguro unitário (R$)"],
    ["taxes", "Impostos sobre venda (%)"],
    ["commission", "Comissão sobre venda (%)"],
    ["fees", "Outras taxas sobre venda (%)"],
    ["margin", "Margem de contribuição desejada (%)"],
    ["quantity", "Quantidade (unidades)"],
  ];
  return (
    <Modal title="Proposta comercial e cálculo interno" close={close}>
      <div className="space-y-4">
        <Field label="Produto">
          <input
            className={inputClass}
            value={product}
            onChange={(e) => setProduct(e.target.value)}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          {fields.map(([k, label]) => (
            <Field label={label} key={k}>
              <input
                type="number"
                min="0"
                step={k === "quantity" ? "1" : "0.01"}
                className={inputClass}
                value={pricing[k]}
                onChange={(e) =>
                  setPricing({
                    ...pricing,
                    [k]: e.target.value === "" ? NaN : Number(e.target.value),
                  })
                }
              />
            </Field>
          ))}
          <Field label="Modalidade">
            <select
              className={inputClass}
              value={pricing.mode}
              onChange={(e) =>
                setPricing({
                  ...pricing,
                  mode: e.target.value as "CIF" | "FOB",
                })
              }
            >
              <option>CIF</option>
              <option>FOB</option>
            </select>
          </Field>
        </div>
        {error && (
          <p className="text-sm text-amber-300" role="alert">
            {error}
          </p>
        )}
        {result && (
          <div className="rounded-xl bg-zinc-950 p-4 text-sm">
            <p>
              Preço unitário: <b>{money(result.unit)}</b> · Total:{" "}
              <b>{money(result.total)}</b>
            </p>
            <p className="mt-2 text-zinc-400">
              Contribuição estimada: {money(result.contribution)} · Margem:{" "}
              {result.margin.toFixed(2)}% · Markup: {result.markup.toFixed(2)}%
            </p>
            <p className="mt-2 text-xs text-zinc-500">
              Estimativa com os custos e percentuais informados. Não representa
              lucro líquido; despesas fixas e tributos não informados ficam fora
              do cálculo.
            </p>
          </div>
        )}
        <h3 className="font-medium">Texto externo para revisão</h3>
        <pre className="whitespace-pre-wrap rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-300">
          {proposal || "Preencha os campos para gerar o rascunho."}
        </pre>
        <div className="flex flex-wrap gap-2">
          <button
            className={primaryClass}
            disabled={!proposal}
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(proposal);
                setNotice("Proposta copiada.");
              } catch {
                setNotice("Não foi possível copiar. Selecione o texto acima.");
              }
            }}
          >
            Copiar proposta
          </button>
          {proposal && whatsappLink(contact.phone, proposal) && (
            <a
              className={buttonClass}
              href={whatsappLink(contact.phone, proposal)}
              target="_blank"
              rel="noopener noreferrer"
            >
              Abrir WhatsApp
            </a>
          )}
        </div>
        <p className="text-xs text-zinc-500">
          Abrir o WhatsApp não confirma envio nem registra abordagem. Registre a
          interação depois de realizá-la.
        </p>
        {notice && (
          <p role="status" className="text-sm text-emerald-300">
            {notice}
          </p>
        )}
      </div>
    </Modal>
  );
}
function ContactEditor({
  contact,
  close,
  saved,
}: {
  contact: any;
  close: () => void;
  saved: () => Promise<void>;
}) {
  const [draft, setDraft] = useState({
    status: contact.status,
    notes: contact.notes || "",
    estimatedValue: contact.estimatedValue || 0,
    nextAction: contact.nextAction || "",
    nextActionDate: contact.nextActionDate || "",
  });
  const [history, setHistory] = useState<any[]>([]),
    [channel, setChannel] = useState("whatsapp"),
    [summary, setSummary] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api(`/api/contacts/${contact.id}/interactions`)
      .then(setHistory)
      .catch((e) => setError(e.message));
  }, [contact.id]);
  async function save() {
    setBusy(true);
    setError("");
    try {
      await api(`/api/contacts/${contact.id}`, send("PATCH", draft));
      await saved();
      close();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function record() {
    setBusy(true);
    setError("");
    try {
      await api(
        `/api/contacts/${contact.id}/interactions`,
        send("POST", { type: channel, notes: summary }),
      );
      setSummary("");
      setHistory(await api(`/api/contacts/${contact.id}/interactions`));
      await saved();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={`Oportunidade · ${contact.name}`} close={close}>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Etapa comercial">
            <select
              className={inputClass}
              value={draft.status}
              onChange={(e) => setDraft({ ...draft, status: e.target.value })}
            >
              {Object.entries(stageLabels).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Valor estimado (R$)">
            <input
              className={inputClass}
              type="number"
              min="0"
              value={draft.estimatedValue}
              onChange={(e) =>
                setDraft({ ...draft, estimatedValue: Number(e.target.value) })
              }
            />
          </Field>
          <Field label="Próxima ação">
            <input
              className={inputClass}
              value={draft.nextAction}
              onChange={(e) =>
                setDraft({ ...draft, nextAction: e.target.value })
              }
            />
          </Field>
          <Field label="Data de retorno">
            <input
              className={inputClass}
              type="date"
              value={draft.nextActionDate}
              onChange={(e) =>
                setDraft({ ...draft, nextActionDate: e.target.value })
              }
            />
          </Field>
        </div>
        <Field label="Anotações do operador">
          <textarea
            className={inputClass}
            rows={3}
            value={draft.notes}
            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          />
        </Field>
        <button className={primaryClass} disabled={busy} onClick={save}>
          Salvar oportunidade
        </button>
        <hr className="border-zinc-800" />
        <h3 className="font-semibold">Registrar abordagem realizada</h3>
        <Field label="Canal">
          <select
            className={inputClass}
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
          >
            <option value="whatsapp">WhatsApp</option>
            <option value="call">Ligação</option>
            <option value="email">E-mail</option>
            <option value="meeting">Reunião</option>
            <option value="note">Nota</option>
          </select>
        </Field>
        <Field label="Resumo e retorno obtido">
          <textarea
            className={inputClass}
            rows={2}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
          />
        </Field>
        <button
          className={buttonClass}
          disabled={busy || !summary.trim()}
          onClick={record}
        >
          Registrar interação
        </button>
        {error && (
          <p role="alert" className="text-sm text-rose-300">
            {error}
          </p>
        )}
        <div className="space-y-2">
          {history.map((h) => (
            <article key={h.id} className="rounded-xl bg-zinc-950 p-3 text-sm">
              <p className="text-xs text-zinc-500">
                {when(h.createdAt)} · {h.type}
              </p>
              <p className="mt-1 whitespace-pre-wrap">{h.notes}</p>
            </article>
          ))}
          {!history.length && (
            <p className="text-sm text-zinc-500">
              Nenhuma interação registrada.
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}
function Workspace({ user }: { user: User }) {
  const [tab, setTab] = useState("search"),
    [config, setConfig] = useState<any>(null),
    [contacts, setContacts] = useState<any[]>([]),
    [searches, setSearches] = useState<any[]>([]),
    [inventory, setInventory] = useState<any>(null);
  const [product, setProduct] = useState(""),
    [buyerSegment, setSegment] = useState(""),
    [region, setRegion] = useState("Brasil"),
    [count, setCount] = useState(6),
    [budget, setBudget] = useState(0.1);
  const [run, setRun] = useState<any>(null),
    [leads, setLeads] = useState<any[]>([]),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState(""),
    [stage, setStage] = useState("all"),
    [editing, setEditing] = useState<any>(null),
    [proposal, setProposal] = useState<any>(null),
    [manual, setManual] = useState(false);
  const [manualData, setManualData] = useState({
    name: "",
    phone: "",
    email: "",
    location: "",
    cnpj: "",
    notes: "",
  });
  async function refresh() {
    const values = await Promise.allSettled([
      api("/api/config"),
      api("/api/contacts"),
      api("/api/searches"),
      api("/api/cleanup"),
    ]);
    if (values[0].status === "fulfilled") setConfig(values[0].value);
    if (values[1].status === "fulfilled") setContacts(values[1].value as any[]);
    if (values[2].status === "fulfilled") setSearches(values[2].value as any[]);
    if (values[3].status === "fulfilled") setInventory(values[3].value);
    const failed = values.find((v) => v.status === "rejected");
    if (failed?.status === "rejected") setError(failed.reason.message);
  }
  useEffect(() => {
    clearLegacyCache();
    refresh();
  }, []);
  useEffect(() => {
    if (!run || !activeRun(run) || run.status === "START_UNKNOWN") return;
    let stopped = false,
      timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const next: any = await api(`/api/searches/${run.id}`);
        if (stopped) return;
        if (next.status === "SUCCEEDED") {
          const results: any = await api(`/api/searches/${run.id}/results`);
          if (!stopped) {
            setRun(results);
            setLeads(results.leads || []);
            await refresh();
          }
        } else if (activeRun(next)) {
          setRun(next);
          timer = setTimeout(poll, 2500);
        } else {
          setRun(next);
          setNotice(`Coleta encerrada: ${next.status}.`);
          await refresh();
        }
      } catch (e: any) {
        if (!stopped) {
          setError(e.message);
          timer = setTimeout(poll, 8000);
        }
      }
    }
    timer = setTimeout(poll, 1500);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [run?.id, run?.status]);
  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function start(e: FormEvent) {
    e.preventDefault();
    await act(async () => {
      setLeads([]);
      const requestId = crypto.randomUUID();
      try {
        const row: any = await api(
          "/api/searches",
          send("POST", {
            product,
            buyerSegment,
            locationQuery: region,
            count,
            budgetUsd: budget,
            requestId,
          }),
        );
        if (row.status === "SUCCEEDED") {
          const results: any = await api(`/api/searches/${row.id}/results`);
          setRun(results);
          setLeads(results.leads || []);
        } else setRun(row);
        await refresh();
      } catch (e) {
        await refresh();
        try {
          setRun(await api(`/api/searches/${requestId}`));
        } catch {}
        throw e;
      }
    });
  }
  async function openSearch(r: any) {
    await act(async () => {
      const data: any = await api(`/api/searches/${r.id}/results`);
      setRun(data);
      setLeads(data.leads || []);
      setTab("search");
    });
  }
  async function saveLead(lead: any) {
    await act(async () => {
      const saved: any = await api(
        "/api/contacts",
        send("POST", { requestId: run.id, sourceId: lead.sourceId }),
      );
      setNotice(
        saved.archived
          ? "Este contato já está arquivado. Use o restauro do lote para recuperá-lo."
          : saved.duplicate
            ? "Contato já cadastrado. Etapa, notas e histórico preservados."
            : "Contato salvo na carteira.",
      );
      await refresh();
    });
  }
  const shown = contacts.filter(
    (c) =>
      (stage === "all" || c.status === stage) &&
      `${c.name} ${c.company || ""} ${c.phone} ${c.cnpj || ""}`
        .toLowerCase()
        .includes(filter.toLowerCase()),
  );
  const due = contacts.filter(
    (c) =>
      c.nextActionDate &&
      new Date(`${c.nextActionDate}T23:59:59`).getTime() < Date.now() &&
      !["won", "lost"].includes(c.status),
  );
  function leadCard(c: any, saved: boolean) {
    const source = safeLink(c.sourceUrl),
      wa = whatsappLink(c.phone);
    return (
      <article
        key={c.id || c.sourceId}
        className="flex flex-col rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="mb-1 text-[10px] uppercase tracking-widest text-indigo-300">
              {saved ? stageLabels[c.status] : "Empresa compatível"}
            </p>
            <h3 className="text-lg font-semibold">{c.name}</h3>
          </div>
          <ShieldCheck size={18} className="shrink-0 text-zinc-500" />
        </div>
        <p className="text-sm text-zinc-400">
          {c.location || "Endereço não informado pela fonte"}
        </p>
        <p className="mt-2 text-sm">
          {c.phone || "Telefone não informado pela fonte"}
        </p>
        {c.email && (
          <p className="break-all text-sm text-zinc-400">{c.email}</p>
        )}
        {c.category && (
          <p className="mt-2 text-xs text-zinc-500">{c.category}</p>
        )}
        <div className="my-4 rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-400">
          {source ? (
            <>
              <a
                href={source}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-indigo-300"
              >
                Ver fonte coletada <ExternalLink size={12} />
              </a>
              <p className="mt-2">Captura: {when(c.capturedAt)}</p>
            </>
          ) : c.origin === "manual" ? (
            "Cadastro manual do operador."
          ) : (
            "Registro anterior: fonte ainda não comprovada."
          )}
          <p className="mt-2">
            Intenção de compra não comprovada. Telefone publicado não confirma
            WhatsApp nem decisor.
          </p>
        </div>
        {c.nextAction && (
          <p className="mb-3 text-xs text-amber-300">
            Retorno: {c.nextAction} · {c.nextActionDate || "Sem data"}
          </p>
        )}
        {c.estimatedValue > 0 && (
          <p className="mb-3 text-sm">
            Oportunidade estimada: {money(c.estimatedValue)}
          </p>
        )}
        <div className="mt-auto flex flex-wrap gap-2">
          {wa && (
            <a
              className={buttonClass}
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle size={15} /> WhatsApp
            </a>
          )}
          {wa && (
            <a
              className={buttonClass}
              href={`tel:+${wa.split("wa.me/")[1].split("?")[0]}`}
            >
              <Phone size={15} /> Ligar
            </a>
          )}
          {saved ? (
            <>
              <button className={buttonClass} onClick={() => setEditing(c)}>
                Qualificar / histórico
              </button>
              <button className={buttonClass} onClick={() => setProposal(c)}>
                <FileText size={15} /> Proposta
              </button>
            </>
          ) : (
            <button
              className={primaryClass}
              disabled={busy}
              onClick={() => saveLead(c)}
            >
              Salvar na carteira
            </button>
          )}
        </div>
      </article>
    );
  }
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 bg-zinc-950/95">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-5">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-indigo-600 p-2">
              <Zap size={24} />
            </div>
            <div>
              <h1 className="text-xl font-extrabold">
                Blitz 360 <span className="text-xs text-indigo-300">PRO</span>
              </h1>
              <p className="text-xs text-zinc-500">
                Coleta com fonte · qualificação · acompanhamento
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-zinc-400 sm:block">
              {user.displayName || user.email}
            </span>
            <button
              className={buttonClass}
              onClick={() => logOut().catch((e) => setError(e.message))}
            >
              <LogOut size={16} /> Sair
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl space-y-6 px-5 py-6">
        <nav className="flex flex-wrap gap-2">
          {[
            ["search", "Prospecção"],
            ["crm", "Carteira comercial"],
            ["settings", "Operação e limpeza"],
          ].map(([k, label]) => (
            <button
              key={k}
              className={tab === k ? primaryClass : buttonClass}
              onClick={() => setTab(k)}
            >
              {k === "search" ? (
                <Search size={16} />
              ) : k === "crm" ? (
                <Database size={16} />
              ) : (
                <Archive size={16} />
              )}{" "}
              {label}
            </button>
          ))}
        </nav>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            ["Contatos ativos", contacts.length],
            [
              "Qualificados",
              contacts.filter((c) => c.status === "qualified").length,
            ],
            [
              "Vendas ganhas",
              contacts.filter((c) => c.status === "won").length,
            ],
            ["Retornos vencidos", due.length],
          ].map(([label, value]) => (
            <div
              key={String(label)}
              className="rounded-xl border border-zinc-800 bg-zinc-900 p-4"
            >
              <p className="text-xs text-zinc-500">{label}</p>
              <p className="mt-1 text-2xl font-bold">{value}</p>
            </div>
          ))}
        </div>
        {error && (
          <div
            role="alert"
            className="rounded-xl border border-rose-800 bg-rose-950/30 p-4 text-sm text-rose-200"
          >
            {error}
          </div>
        )}
        {notice && (
          <div
            role="status"
            className="rounded-xl border border-emerald-800 bg-emerald-950/30 p-4 text-sm text-emerald-200"
          >
            {notice}
          </div>
        )}
        {tab === "search" && (
          <>
            <section className="rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900 to-indigo-950/25 p-5 md:p-7">
              <h2 className="text-2xl font-bold">
                Encontrar empresas para qualificação
              </h2>
              <p className="mt-2 max-w-3xl text-sm text-zinc-400">
                Pesquise pelo tipo de empresa que pode comprar seu produto. O
                Maps localiza estabelecimentos; a oportunidade só é confirmada
                após evidência ou contato comercial.
              </p>
              <form
                onSubmit={start}
                className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
              >
                <Field label="Produto que você vende (contexto)">
                  <input
                    className={inputClass}
                    placeholder="Ex.: iodo 10%"
                    value={product}
                    onChange={(e) => setProduct(e.target.value)}
                  />
                </Field>
                <Field label="Segmento comprador (busca no Maps)">
                  <input
                    className={inputClass}
                    required
                    placeholder="Ex.: distribuidoras agropecuárias"
                    value={buyerSegment}
                    onChange={(e) => setSegment(e.target.value)}
                  />
                </Field>
                <Field label="Cidade, UF ou Brasil">
                  <input
                    className={inputClass}
                    required
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                  />
                </Field>
                <Field label="Quantidade máxima de resultados">
                  <input
                    type="number"
                    className={inputClass}
                    min="1"
                    max="20"
                    step="1"
                    value={count}
                    onChange={(e) => setCount(Number(e.target.value))}
                  />
                </Field>
                <Field
                  label={`Limite autorizado desta coleta (USD; teto ${config?.maxRunUsd ?? "0,50"})`}
                >
                  <input
                    className={inputClass}
                    type="number"
                    min="0.01"
                    max={config?.maxRunUsd || 0.5}
                    step="0.01"
                    value={budget}
                    onChange={(e) => setBudget(Number(e.target.value))}
                  />
                </Field>
                <div className="flex items-end">
                  <button
                    className={`${primaryClass} w-full py-3`}
                    disabled={
                      busy || activeRun(run) || !config?.apifyConfigured
                    }
                  >
                    <Search size={18} /> Iniciar coleta Apify
                  </button>
                </div>
              </form>
              <div className="mt-4 text-xs text-zinc-500">
                {config?.apifyConfigured
                  ? `Apify configurado. A execução pode consumir créditos ou saldo; limite diário do servidor: USD ${config.dailyUsd}.`
                  : "Integração pendente: adicione APIFY_TOKEN nos segredos do servidor. Nenhuma empresa será inventada."}
              </div>
            </section>
            {run && (
              <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
                <div>
                  <p className="font-medium">
                    {activeRun(run) && (
                      <LoaderCircle
                        size={15}
                        className="mr-2 inline animate-spin"
                      />
                    )}
                    Coleta: {run.status}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {run.buyerSegment} · {run.locationQuery} · ID {run.id}
                  </p>
                  {run.status === "START_UNKNOWN" && (
                    <p className="mt-2 text-xs text-amber-300">
                      Início incerto. Verifique no Apify antes de repetir; a
                      reserva de orçamento foi mantida.
                    </p>
                  )}
                </div>
                {activeRun(run) && run.runId && (
                  <button
                    className={buttonClass}
                    disabled={busy}
                    onClick={() =>
                      act(async () => {
                        setRun(
                          await api(
                            `/api/searches/${run.id}/cancel`,
                            send("POST", {}),
                          ),
                        );
                        await refresh();
                      })
                    }
                  >
                    Solicitar cancelamento
                  </button>
                )}
              </section>
            )}
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {leads.map((c) => leadCard(c, false))}
            </div>
            {run?.status === "SUCCEEDED" && !leads.length && (
              <p className="rounded-xl border border-zinc-800 p-6 text-zinc-400">
                Nenhum resultado com nome e URL de origem válidos foi
                encontrado. Ajuste segmento ou região.
              </p>
            )}
            <section className="space-y-3">
              <h3 className="font-semibold">
                Consultas anteriores desta conta
              </h3>
              {!searches.length && (
                <p className="text-sm text-zinc-500">
                  Nenhuma consulta ativa no histórico.
                </p>
              )}
              {searches.map((r) => (
                <button
                  key={r.id}
                  className="flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-left text-sm hover:border-indigo-500"
                  onClick={() => openSearch(r)}
                >
                  <span>
                    {r.buyerSegment || r.query || "Consulta anterior"} ·{" "}
                    {r.locationQuery || r.location || ""}
                  </span>
                  <span className="text-xs text-zinc-500">
                    {r.status} · {when(r.createdAt)}
                  </span>
                </button>
              ))}
            </section>
          </>
        )}
        {tab === "crm" && (
          <>
            <section className="flex flex-wrap gap-3">
              <input
                aria-label="Filtrar contatos"
                className={`${inputClass} max-w-sm`}
                placeholder="Nome, telefone ou CNPJ"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
              <select
                aria-label="Filtrar etapa"
                className={`${inputClass} max-w-xs`}
                value={stage}
                onChange={(e) => setStage(e.target.value)}
              >
                <option value="all">Todas as etapas</option>
                {Object.entries(stageLabels).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <button className={buttonClass} onClick={() => setManual(true)}>
                <Plus size={16} /> Cadastro manual
              </button>
              <button
                className={buttonClass}
                disabled={!shown.length}
                onClick={() => downloadCsv(shown)}
              >
                <Download size={16} /> Exportar CSV
              </button>
            </section>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {shown.map((c) => leadCard(c, true))}
            </div>
            {!shown.length && (
              <p className="rounded-xl border border-zinc-800 p-8 text-center text-zinc-500">
                Nenhum contato nesta seleção.
              </p>
            )}
          </>
        )}
        {tab === "settings" && (
          <div className="grid gap-5 lg:grid-cols-2">
            <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
              <h2 className="text-lg font-bold">Integrações e procedência</h2>
              <div className="mt-4 space-y-3">
                {config?.sources?.map((s: any) => (
                  <p key={s.id} className="rounded-xl bg-zinc-950 p-3 text-sm">
                    {s.name}{" "}
                    <span
                      className={
                        s.enabled ? "text-emerald-300" : "text-amber-300"
                      }
                    >
                      · {s.enabled ? "Configurado" : "Pendente"}
                    </span>
                  </p>
                ))}
              </div>
              <p className="mt-4 text-sm text-zinc-400">
                Configure APIFY_TOKEN no servidor. Tokens não são solicitados
                nem armazenados neste navegador. A credencial de serviço do
                Firebase precisa ter acesso ao banco do projeto.
              </p>
              <p className="mt-3 text-xs text-zinc-500">
                Fontes sociais, PNCP e enriquecimentos não configurados
                permanecem indisponíveis. Nenhum coletor antigo é usado como
                alternativa.
              </p>
              <button
                className={`${buttonClass} mt-4`}
                onClick={() => act(refresh)}
              >
                Atualizar diagnóstico
              </button>
            </section>
            <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
              <h2 className="text-lg font-bold">Limpeza reversível</h2>
              <p className="mt-3 text-sm text-zinc-400">
                Retira consultas concluídas e contatos da visão ativa desta
                conta, preservando os dados e o histórico em um lote
                restaurável. Coletas em andamento precisam ser encerradas antes
                de sair do histórico.
              </p>
              <div className="my-4 rounded-xl bg-zinc-950 p-4 text-sm">
                <p>Contatos ativos: {inventory?.contacts ?? "—"}</p>
                <p>Consultas no histórico: {inventory?.searches ?? "—"}</p>
                <p>Coletas ainda não encerradas: {inventory?.running ?? "—"}</p>
                <p>
                  Contatos já arquivados: {inventory?.archivedContacts ?? "—"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  className={buttonClass}
                  disabled={busy || !inventory}
                  onClick={() =>
                    act(async () => {
                      const batchId =
                        inventory?.lastBatch?.state === "ARCHIVING"
                          ? inventory.lastBatch.id
                          : undefined;
                      const result: any = await api(
                        "/api/cleanup/archive",
                        send("POST", { batchId }),
                      );
                      clearLegacyCache();
                      setLeads([]);
                      setRun(null);
                      setProduct("");
                      setSegment("");
                      setNotice(
                        `Lote ${result.batchId}: ${result.contacts} contatos e ${result.searches} consultas arquivados. Coletas não encerradas preservadas: ${result.skippedRunning}.`,
                      );
                      await refresh();
                    })
                  }
                >
                  <Archive size={16} /> Limpar consultas anteriores
                </button>
                <button
                  className={buttonClass}
                  disabled={busy || !inventory?.lastBatch}
                  onClick={() =>
                    act(async () => {
                      const result: any = await api(
                        "/api/cleanup/restore",
                        send("POST", { batchId: inventory.lastBatch.id }),
                      );
                      setNotice(
                        `${result.restored} registros restaurados do lote ${result.batchId}.`,
                      );
                      await refresh();
                    })
                  }
                >
                  <RotateCcw size={16} /> Restaurar último lote
                </button>
              </div>
              {inventory?.lastBatch && (
                <p className="mt-4 break-all text-xs text-zinc-500">
                  Último lote: {inventory.lastBatch.id} ·{" "}
                  {inventory.lastBatch.state}
                </p>
              )}
            </section>
          </div>
        )}
        <footer className="border-t border-zinc-800 pt-5 text-xs text-zinc-600">
          Blitz 360 · Dados publicados não comprovam intenção de compra. Valide
          o contato e registre o retorno comercial.
        </footer>
      </main>
      {editing && (
        <ContactEditor
          contact={editing}
          close={() => setEditing(null)}
          saved={refresh}
        />
      )}{" "}
      {proposal && (
        <Proposal contact={proposal} close={() => setProposal(null)} />
      )}{" "}
      {manual && (
        <Modal
          title="Cadastro manual identificado"
          close={() => setManual(false)}
        >
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              act(async () => {
                await api(
                  "/api/contacts",
                  send("POST", { manual: manualData }),
                );
                await refresh();
                setManual(false);
                setManualData({
                  name: "",
                  phone: "",
                  email: "",
                  location: "",
                  cnpj: "",
                  notes: "",
                });
                setNotice("Cadastro manual salvo.");
              });
            }}
          >
            {Object.entries({
              name: "Nome",
              phone: "Telefone completo com DDD",
              email: "E-mail",
              location: "Localização",
              cnpj: "CNPJ (se conhecido)",
              notes: "Anotações",
            }).map(([k, label]) => (
              <Field label={label} key={k}>
                <input
                  className={inputClass}
                  required={k === "name"}
                  value={manualData[k as keyof typeof manualData]}
                  onChange={(e) =>
                    setManualData({ ...manualData, [k]: e.target.value })
                  }
                />
              </Field>
            ))}
            <button className={primaryClass} disabled={busy}>
              Salvar cadastro manual
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
export default function App() {
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true);
  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        setUser(u);
        setLoading(false);
      }),
    [],
  );
  if (loading)
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">
        Carregando sessão…
      </div>
    );
  return user ? <Workspace key={user.uid} user={user} /> : <LoginScreen />;
}
