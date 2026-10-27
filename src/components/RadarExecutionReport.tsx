import type { ExecutionReport, ExtractedResult } from "../types";
import { SourceEvidence } from "./SourceEvidence";
const states: Record<string, string> = {
  running: "Em andamento",
  complete: "Completa nas fontes consultadas",
  partial: "Parcial",
  unavailable: "Indisponível",
  no_matches: "Sem correspondências",
  blocked: "Bloqueada",
  failed: "Falhou",
  limited: "Limitada",
  not_consulted: "Não consultada",
};
export function RadarExecutionReport({
  report,
  unconfirmed = [],
}: {
  report?: ExecutionReport;
  unconfirmed?: ExtractedResult[];
}) {
  if (!report) return null;
  const downloadReport = () => {
    const file = new Blob([JSON.stringify(report, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = "blitz-radar-relatorio.json";
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <section className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 text-xs text-zinc-300">
      <h3 className="font-semibold">
        Relatório de execução — {states[report.state] || report.state}
      </h3>
      <button
        type="button"
        onClick={downloadReport}
        className="mt-2 text-sky-400 underline"
      >
        Baixar relatório JSON (sem token de sessão)
      </button>
      <p className="mt-2">{report.summary}</p>
      {report.reusedExecution && (
        <p className="text-amber-300">
          Execução/cache reaproveitado; não houve nova coleta paga.
        </p>
      )}
      <div className="overflow-x-auto mt-3">
        <table className="w-full text-left">
          <thead>
            <tr>
              <th>Fonte</th>
              <th>Situação</th>
              <th>Recebidos</th>
              <th>Qualificados</th>
              <th>Custo informado</th>
            </tr>
          </thead>
          <tbody>
            {report.sources.map((s, i) => (
              <tr key={i} className="border-t border-zinc-800">
                <td className="py-2">{s.source}</td>
                <td>
                  {s.consulted ? "Consultada" : "Não consultada"} ·{" "}
                  {states[s.status] || s.status}
                </td>
                <td>{s.received}</td>
                <td>{s.qualified}</td>
                <td>
                  {typeof s.providerCostUsd === "number"
                    ? `US$ ${s.providerCostUsd.toFixed(4)}`
                    : "Não informado"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {report.sources.map((s, i) => (
        <details key={i} className="mt-2">
          <summary>{s.source} — consultas, descartes e limites</summary>
          {s.url && <p className="break-all">URL: {s.url}</p>}
          {s.query && <p>Consulta: {s.query}</p>}
          {s.runId && <p>Run Apify: {s.runId}</p>}
          {s.pages && (
            <p>
              Páginas: {s.pages} · Total informado:{" "}
              {s.providerTotal ?? "não informado"} · Registros normalizados:{" "}
              {s.normalized ?? "não informado"}
            </p>
          )}
          {typeof s.providerCredits === "number" && (
            <p>Créditos informados: {s.providerCredits}</p>
          )}
          {s.cacheHit && (
            <p>
              Cache coletado em{" "}
              {new Date(s.collectedAt!).toLocaleString("pt-BR")} · válido até{" "}
              {new Date(s.expiresAt!).toLocaleString("pt-BR")}
            </p>
          )}
          <p>
            {Object.entries(s.discarded)
              .map(([k, v]) => `${k.replaceAll("_", " ")}: ${v}`)
              .join(" · ")}
          </p>
          {s.balance && <p>{s.balance}</p>}
          {typeof s.reservedUsd === "number" && (
            <p>
              Reserva máxima: US$ {s.reservedUsd.toFixed(4)} (não é custo
              faturado).
            </p>
          )}
          {[...s.errors, ...s.limits].map((t, j) => (
            <p key={j} className="text-amber-300">
              {t}
            </p>
          ))}
        </details>
      ))}
      <details className="mt-3">
        <summary>Descoberta manual de fontes — links não coletados</summary>
        {report.manualSearchLinks?.map((s, i) => (
          <a
            key={i}
            href={s.url}
            target="_blank"
            rel="noreferrer"
            className="block text-sky-400 underline mt-1"
          >
            {s.q}
          </a>
        ))}
      </details>
      {!!unconfirmed.length && (
        <details className="mt-3">
          <summary>
            Região não comprovada ({unconfirmed.length}) — não contam como
            compradores da cidade
          </summary>
          {unconfirmed.map((r, i) => (
            <article key={i} className="mt-3 border-t border-zinc-800 pt-2">
              <p>
                {r.name} — {r.intent}
              </p>
              <p>
                Local declarado: {r.authorDeclaredLocation || "não informado"} ·
                Local citado: {r.publicationLocation || "não informado"} ·
                Contexto do grupo: {r.groupContext || "não informado"}
              </p>
              <a
                href={r.profileUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sky-400 underline"
              >
                Publicação original
              </a>
              <SourceEvidence record={r} />
            </article>
          ))}
        </details>
      )}
    </section>
  );
}
