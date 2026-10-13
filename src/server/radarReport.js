import {
  intentAssessment,
  declaredRegion,
  discoveryQueries,
} from "./purchaseIntent.js";
import { qualifySocialRecord } from "./socialRadar.js";
export const discardKeys = [
  "produto",
  "vendedor",
  "intencao_ausente",
  "regiao_desconhecida",
  "regiao_divergente",
  "duplicidade",
  "data",
  "autor_ausente",
  "fonte_invalida",
];
export function sourceReport(source, extra = {}) {
  return {
    source,
    consulted: false,
    status: "not_consulted",
    received: 0,
    qualified: 0,
    regionalUnconfirmed: 0,
    discarded: Object.fromEntries(discardKeys.map((k) => [k, 0])),
    errors: [],
    limits: [],
    providerCostUsd: null,
    ...extra,
  };
}
export function classifyRecords(
  records,
  platform,
  query,
  location,
  report,
  deps = {},
) {
  const leads = [],
    regionalUnconfirmed = [],
    seen = deps.seen || new Set(),
    now = deps.now || Date.now(),
    maxAge =
      Math.min(
        365,
        Math.max(1, Number(process.env.BLITZ_RADAR_MAX_AGE_DAYS) || 30),
      ) * 86400000;
  for (const raw of records) {
    const record = { ...raw, text: String(raw.text || "").slice(0, 6000) };
    const assessment = intentAssessment(record.text, query);
    if (!assessment.qualified) {
      report.discarded[assessment.reason]++;
      continue;
    }
    const date = Date.parse(record.publishedAt);
    if (
      Number.isFinite(date) &&
      (date > now + 86400000 || now - date > maxAge)
    ) {
      report.discarded.data++;
      continue;
    }
    if (!record.name || /\*{2,}|anonymous|anonimo/i.test(record.name)) {
      report.discarded.autor_ausente++;
      continue;
    }
    const key = `${record.sourceUrl}:${record.id || record.text}`;
    if (seen.has(key)) {
      report.discarded.duplicidade++;
      continue;
    }
    seen.add(key);
    const region = declaredRegion(record.text, location);
    if (region.status === "conflicting") {
      report.discarded.regiao_divergente++;
      continue;
    }
    const lead = qualifySocialRecord(
      record,
      platform,
      query,
      location,
      deps.retrievedAt || new Date(now).toISOString(),
      { allowUnconfirmed: true, allowPublic: platform === "website" },
    );
    if (!lead) {
      report.discarded.fonte_invalida++;
      continue;
    }
    lead.authorDeclaredLocation = region.authorDeclared || "";
    lead.publicationLocation = region.publicationMention || "";
    lead.groupContext = record.groupContext || "";
    if (
      !Number.isFinite(date) &&
      !report.limits.includes(
        "Data da publicação não informada; atualidade não comprovada.",
      )
    )
      report.limits.push(
        "Data da publicação não informada; atualidade não comprovada.",
      );
    if (!region.matched) {
      report.discarded.regiao_desconhecida++;
      report.regionalUnconfirmed++;
      regionalUnconfirmed.push(lead);
    } else {
      report.qualified++;
      leads.push(lead);
    }
  }
  return { leads, regionalUnconfirmed };
}
export function manualSearchLinks(query, location) {
  return discoveryQueries(query, location).map((s) => ({
    ...s,
    url: `https://www.google.com/search?q=${encodeURIComponent(s.q)}`,
    collected: false,
  }));
}
export function finishReport(sources, leads, done = true) {
  const consulted = sources.filter((s) => s.consulted),
    failure = sources.some((s) =>
      ["failed", "blocked", "limited"].includes(s.status),
    );
  const successful = consulted.filter(
    (s) =>
      s.kind !== "discovery" &&
      s.kind !== "control" &&
      s.kind !== "market" &&
      ["complete", "no_matches"].includes(s.status),
  );
  const state = !done
    ? "running"
    : !successful.length
      ? "unavailable"
      : failure
        ? "partial"
        : !leads.length
          ? "no_matches"
          : "complete";
  return {
    state,
    sources,
    generatedAt: new Date().toISOString(),
    summary: !done
      ? "Coleta em andamento."
      : state === "unavailable"
        ? "Coleta indisponível: não há fonte concluída acessível. Zero resultados não comprova ausência de compradores."
        : state === "partial"
          ? "Coleta parcial: houve falhas ou limites. Zero resultados não comprova ausência de compradores."
          : state === "no_matches"
            ? "Sem correspondências nas fontes efetivamente consultadas; isso não comprova ausência de compradores."
            : `${leads.length} publicações com intenção textual e evidência regional; não comprova compra atual ou residência.`,
  };
}
