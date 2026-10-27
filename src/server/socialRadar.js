import {buyerLocation} from '../utils/searchScope.js';
import { sourceReport, classifyRecords, finishReport } from "./radarReport.js";
import { marketplacePlans, normalizeMarketplaceRows } from "./marketplaces.js";
import { createHmac, timingSafeEqual } from "node:crypto";
import { SearchError, normalize } from "./verifiedSearch.js";
import {
  productQuery,
  discoveryQueries,
  intentAssessment,
  declaredRegion,
} from "./purchaseIntent.js";
const actors = {
  facebook: "apify~facebook-groups-scraper",
  instagram: "apify~instagram-comment-scraper",
  tiktok: "clockworks~tiktok-comments-scraper",
};
const terminal = new Set(["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"]);
const sign = (payload, key) =>
  createHmac("sha256", key).update(payload).digest("base64url");
export function issueJob(payload, key) {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return data + "." + sign(data, key);
}
export function verifyJob(token, key) {
  if (typeof token !== "string" || token.length > 20000)
    throw new SearchError("Identificador de coleta inválido.", 400);
  const [data, signature, ...rest] = token.split(".");
  if (!data || !signature || rest.length)
    throw new SearchError("Coleta inválida.", 400);
  const expected = sign(data, key);
  if (
    rest.length ||
    !signature ||
    Buffer.byteLength(signature) !== Buffer.byteLength(expected) ||
    !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  )
    throw new SearchError("Coleta não autorizada.", 400);
  let payload;
  try {
    payload = JSON.parse(Buffer.from(data, "base64url").toString());
  } catch {
    throw new SearchError("Coleta inválida.", 400);
  }
  if (payload.expiresAt < Date.now())
    throw new SearchError("Coleta expirada. Execute uma nova busca.", 410);
  return payload;
}
export function platformUrl(raw, platform) {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || u.username || u.password) return "";
    const host = u.hostname.replace(/^www\.|^m\./, "");
    if (
      platform === "facebook" &&
      host === "facebook.com" &&
      /^\/groups\/[^/]+/.test(u.pathname)
    )
      return `https://www.facebook.com${u.pathname.match(/^\/groups\/[^/]+(?:\/(?:posts|permalink)\/\d+)?/)[0]}/`;
    if (
      platform === "instagram" &&
      host === "instagram.com" &&
      /^\/(p|reel)\/[\w-]+/.test(u.pathname)
    )
      return `https://www.instagram.com${u.pathname.match(/^\/(p|reel)\/[\w-]+/)[0]}/`;
    if (
      platform === "tiktok" &&
      host === "tiktok.com" &&
      /^\/@[\w.]+\/video\/\d+/.test(u.pathname)
    )
      return `https://www.tiktok.com${u.pathname}`;
  } catch {}
  return "";
}
async function api(path, token, options = {}, deps = {}) {
  const response = await (deps.fetcher || fetch)(
    `https://api.apify.com/v2/${path}`,
    {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
      signal: AbortSignal.timeout(
        Math.max(
          1,
          Math.min(10000, (deps.deadline || Date.now() + 10000) - Date.now()),
        ),
      ),
    },
  );
  if (!response.ok)
    throw new SearchError(
      `Apify respondeu HTTP ${response.status}. Verifique token, saldo e acesso ao Actor.`,
    );
  return response.json();
}
export async function discoverSources(query, location, deps = {}) {
  const key = deps.serperKey ?? process.env.SERPER_API_KEY;
  if (!key) {
    deps.reports?.push(
      sourceReport("Serper", {
        status: "blocked",
        limits: ["SERPER_API_KEY ausente."],
      }),
    );
    return {
      sources: [],
      warnings: [
        "SERPER_API_KEY ausente: informe links públicos de origem para a coleta social.",
      ],
    };
  }
  const results = [];
  for (const search of discoveryQueries(query, location).slice(
    0,
    deps.paidPermit?.serperQueries || 0,
  )) {
    const report = sourceReport(`Serper ${search.platform}`, {
      kind: "discovery",
      consulted: true,
      query: search.q,
      status: "running",
      balance: "saldo não verificado",
    });
    deps.reports?.push(report);
    results.push(
      await (async () => {
        try {
          const response = await (deps.fetcher || fetch)(
            "https://google.serper.dev/search",
            {
              method: "POST",
              headers: { "X-API-KEY": key, "Content-Type": "application/json" },
              body: JSON.stringify({
                q: search.q,
                gl: "br",
                hl: "pt-br",
                num: 10,
              }),
              signal: AbortSignal.timeout(
                Math.max(
                  1,
                  Math.min(
                    10000,
                    (deps.deadline || Date.now() + 10000) - Date.now(),
                  ),
                ),
              ),
            },
          );
          if (!response.ok) {
            report.status = "failed";
            report.errors.push(`HTTP ${response.status}`);
            return {
              sources: [],
              warning: `Descoberta ${search.platform}: HTTP ${response.status}.`,
            };
          }
          const data = await response.json();
          report.discarded.fonte_invalida = (data.organic || []).filter(
            (item) => !platformUrl(item.link, search.platform),
          ).length;
          report.received = (data.organic || []).length;
          if (Number.isFinite(data.credits))
            report.providerCredits = data.credits;
          report.status = report.received ? "complete" : "no_matches";
          return {
            sources: (data.organic || [])
              .map((item) => ({
                platform: search.platform,
                url: platformUrl(item.link, search.platform),
              }))
              .filter((s) => s.url),
          };
        } catch {
          report.status = "failed";
          report.errors.push("Descoberta indisponível.");
          return {
            sources: [],
            warning: `Descoberta ${search.platform} indisponível.`,
          };
        }
      })(),
    );
  }
  return {
    sources: results.flatMap((r) => r.sources),
    warnings: results.map((r) => r.warning).filter(Boolean),
  };
}
export function normalizeSocialRows(rows, platform, inputUrl) {
  const output = [];
  for (const row of rows) {
    if (row.error || row.errorCode) continue;
    if (platform === "facebook") {
      if (row.text)
        output.push({
          text: row.text,
          name: row.user?.name || "",
          authorUrl:
            row.user?.url ||
            (row.user?.id && /^\d+$/.test(row.user.id)
              ? `https://www.facebook.com/profile.php?id=${row.user.id}`
              : ""),
          sourceUrl: row.url || "",
          groupContext: row.groupName || "",
          publishedAt: row.time,
          id: row.legacyId || row.id,
        });
      for (const c of row.topComments || [])
        output.push({
          text: c.text,
          name: c.profileName || "",
          authorUrl: c.profileUrl || "",
          sourceUrl: c.commentUrl || row.url || "",
          groupContext: row.groupName || "",
          publishedAt: c.date,
          id: c.id,
        });
    } else if (platform === "instagram") {
      output.push({
        text: row.text,
        name: row.ownerUsername || "",
        authorUrl: /^[\w.]+$/.test(row.ownerUsername || "")
          ? `https://www.instagram.com/${row.ownerUsername}/`
          : "",
        sourceUrl: row.commentUrl || row.postUrl || inputUrl,
        publishedAt: row.timestamp,
        id: row.id,
      });
    } else if (platform === "tiktok") {
      output.push({
        text: row.text,
        name: row.uniqueId || "",
        authorUrl: /^[\w.]+$/.test(row.uniqueId || "")
          ? `https://www.tiktok.com/@${row.uniqueId}`
          : "",
        sourceUrl: row.videoWebUrl || inputUrl,
        publishedAt: row.createTimeISO,
        id: row.cid,
      });
    }
  }
  return output;
}
export function qualifySocialRecord(
  record,
  platform,
  query,
  location,
  retrievedAt = new Date().toISOString(),
  options = {},
) {
  const assessment = intentAssessment(record.text, query),
    region = declaredRegion(record.text, location);
  if (
    !assessment.qualified ||
    (!region.matched && !options.allowUnconfirmed) ||
    !record.sourceUrl ||
    !record.name ||
    /\*{2,}|anonymous|anonimo/i.test(record.name)
  )
    return null;
  // Validate the source domain, not an arbitrary URL in a dataset row.
  try {
    const u = new URL(record.sourceUrl);
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      (!options.allowPublic &&
        ![
          "facebook.com",
          "www.facebook.com",
          "m.facebook.com",
          "instagram.com",
          "www.instagram.com",
          "tiktok.com",
          "www.tiktok.com",
        ].includes(u.hostname))
    )
      return null;
  } catch {
    return null;
  }
  const lead = {
    name: record.name,
    phone: "",
    email: "",
    instagram: "",
    location: region.label,
    profileUrl: record.publicationUrl || record.sourceUrl,
    authorProfileUrl: record.authorUrl,
    platform,
    recordType: "purchase_mention",
    verificationStatus: "source_observed",
    intent: record.text,
    category: "",
    decisionMaker: "",
    decisionMakerPhone: "",
    whatsapp: "",
    tem_whatsapp: null,
    evidence: {},
    matchedProduct: assessment.matchedProduct,
    geographicStatus: region.status,
    purchaseIntentClassification: assessment.classification,
  };
  retrievedAt = record.retrievedAt || retrievedAt;
  function set(field, value, excerpt = record.text) {
    lead[field] = value;
    lead.evidence[field] = {
      value,
      sourceUrl: record.sourceUrl,
      source:
        record.collector || (platform === "website"
          ? "Fonte pública estruturada"
          : `Apify — ${actors[platform]}`),
      retrievedAt,
      excerpt,
      recordId: String(record.id || ""),
    };
  }
  set("name", record.name, record.name);
  set("intent", record.text);
  if (record.authorUrl) set("authorProfileUrl", record.authorUrl, `Autor informado no registro: ${record.name}`);
  if (region.label) set("location", region.label, record.text);
  if (platform === "instagram" && record.authorUrl)
    set("instagram", record.authorUrl);
  // Only a number explicitly offered by the same author in the same post/comment.
  const phone = String(record.text).match(
    /(?:meu\s+(?:whats(?:app)?|telefone)|me\s+cham[ae]\s+(?:no\s+)?whats(?:app)?)\s*[:=\-]?\s*((?:\+?55[ .-]?)?\(?\d{2}\)?[ .-]?9?\d{4}[ .-]?\d{4})/i,
  )?.[1];
  if (phone) {
    let d = phone.replace(/\D/g, "");
    if (d.startsWith("55") && d.length > 11) d = d.slice(2);
    if (/^[1-9]\d(?:9\d{8}|[2-5]\d{7})$/.test(d)) set("phone", phone);
  }
  const email = String(record.text).match(
    /meu\s+e-?mail\s*[:=\-]?\s*([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i,
  )?.[1];
  if (email) set("email", email);
  if (record.publishedAt && !Number.isNaN(Date.parse(record.publishedAt))) {
    set("publishedAt", record.publishedAt);
    set("demandTimeframe", `Publicado em ${record.publishedAt}`);
  }
  lead.trendingInsights = [
    `Produto mencionado: ${assessment.matchedProduct}`,
    `Expressão de intenção (heurística): ${assessment.expression}`,
    `Texto original: ${record.text}`,
  ];
  return lead;
}
export async function startSocialRadar(body, deps = {}) {
  if (!deps.paidPermit)
    throw new SearchError(
      "Etapa paga exige orçamento reservado no armazenamento persistente.",
      403,
    );
  const token = deps.apifyToken ?? process.env.APIFY_API_TOKEN;
  if (!token)
    throw new SearchError(
      "Configure APIFY_API_TOKEN no servidor para coletar comentários sociais.",
      503,
    );
  const query = productQuery(body.query),
    location = buyerLocation(body.location),
    count = Number(body.count || 30);
  if (
    !query ||
    query.length > 300 ||
    location.length > 160 ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > 100
  )
    throw new SearchError(
      "Informe produto, região e quantidade de 1 a 100.",
      400,
    );
  if (!location)
    throw new SearchError(
      "Informe Cidade - UF para o radar social regional.",
      400,
    );
  let manual = Array.isArray(body.sourceUrls) ? body.sourceUrls : [];
  if (
    manual.length > 9 ||
    manual.some((u) => typeof u !== "string" || u.length > 500)
  )
    throw new SearchError("Informe até nove links públicos.", 400);
  const configured = String(process.env.BLITZ_PUBLIC_SOCIAL_URLS || "")
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const markets = await marketplacePlans(
    { ...body, query },
    { ...deps, serperKey: "" },
  );
  const discovery =
    manual.length || configured.length
      ? { sources: [], warnings: [] }
      : await discoverSources(query, location, deps);
  const sources = [...manual, ...configured]
    .flatMap((raw) =>
      Object.keys(actors)
        .map((platform) => ({ platform, url: platformUrl(raw, platform) }))
        .filter((s) => s.url),
    )
    .concat(discovery.sources);
  if (manual.length && !sources.length && !markets.plans.length)
    throw new SearchError(
      "Use links de grupo Facebook, post/reel Instagram ou vídeo TikTok públicos.",
      400,
    );
  if (discovery.sources.length && deps.collectDiscovered && (!deps.deadline || Date.now() < deps.deadline-1000)) {
    try {
      if(await deps.collectDiscovered(discovery.sources.map(s=>s.url)))return {done:true,leads:[],meta:{warnings:discovery.warnings}};
    } catch(err) {
      deps.reports?.push(sourceReport("Worker — fontes descobertas",{status:"blocked",errors:[err.message]}));
    }
  }
  // Queue multiple sources per platform; paid fallback remains bounded by the reservation.
  const queued = [
    ...new Map(sources.map((s) => [s.platform + ":" + s.url, s])).values(),
  ].concat(markets.plans);
  const selected = queued.slice(0, deps.paidPermit.maxActors);
  for (const source of queued.slice(deps.paidPermit.maxActors))
    deps.reports?.push(
      sourceReport(source.platform, {
        url: source.url,
        status: "limited",
        limits: [
          "URL na fila não executada: teto de Actors por busca. Faça outra execução direcionada.",
        ],
      }),
    );
  if (!selected.length)
    return {
      done: true,
      leads: [],
      meta: {
        intent: "b2c_consumer",
        summary:
          "Nenhuma origem social pública encontrada. Informe links de grupos, posts ou vídeos.",
        targetAudience: "Menções públicas",
        warnings: discovery.warnings,
      },
    };
  const warnings = [...discovery.warnings, ...markets.warnings];
  const runs = [];
  for (const source of selected) {
    if (deps.deadline && Date.now() >= deps.deadline) {
      deps.reports?.push(
        sourceReport(source.platform, {
          status: "limited",
          limits: ["Tempo da função esgotado antes de iniciar este Actor."],
        }),
      );
      continue;
    }
    const report = sourceReport(source.platform, {
      url: source.url,
      kind: ["shopee", "mercado_livre"].includes(source.platform)
        ? "market"
        : "content",
      consulted: false,
      status: "running",
      reservedUsd: deps.paidPermit.actorUsd,
    });
    deps.reports?.push(report);
    const run = await (async () => {
      const limit = Math.min(100, Math.max(30, count));
      const actorInput =
        source.input ||
        (source.platform === "facebook"
          ? {
              startUrls: [{ url: source.url }],
              resultsLimit: limit,
              viewOption: "CHRONOLOGICAL",
              onlyPostsNewerThan: "30 days",
            }
          : source.platform === "instagram"
            ? {
                directUrls: [source.url],
                resultsLimit: limit,
                includeNestedComments: false,
              }
            : {
                postURLs: [source.url],
                commentsPerPost: limit,
                maxRepliesPerComment: 0,
              });
      try {
        const actor = source.actor || actors[source.platform];
        const info = await api(`acts/${actor}`, token, {}, deps);
        report.metadataConsulted = true;
        const prices = info.data?.pricingInfos || [];
        const pricing = prices
          .filter(
            (p) =>
              (!p.startedAt || Date.parse(p.startedAt) <= Date.now()) &&
              (!p.endedAt || Date.parse(p.endedAt) > Date.now()),
          )
          .sort(
            (a, b) =>
              (Date.parse(a.startedAt) || 0) - (Date.parse(b.startedAt) || 0),
          )
          .at(-1);
        if (pricing?.pricingModel !== "PAY_PER_EVENT")
          throw new SearchError(
            "Actor bloqueado: modelo de preço/teto financeiro não comprovado como PAY_PER_EVENT. Verifique a configuração externa.",
          );
        report.consulted = true;
        report.startUncertain = true;
        const data = await api(
          `acts/${actor}/runs?waitForFinish=0&timeout=240&maxItems=${limit}&maxTotalChargeUsd=${deps.paidPermit.actorUsd}`,
          token,
          { method: "POST", body: JSON.stringify(actorInput) },
          deps,
        );
        if (!data.data?.id) throw new Error("Missing run ID");
        report.startUncertain = false;
        report.runId = data.data.id;
        return {
          platform: source.platform,
          url: source.url,
          runId: data.data.id,
        };
      } catch (err) {
        report.status = "failed";
        report.errors.push(err.message);
        if (report.startUncertain)
          report.limits.push(
            "Tentativa de início sem run ID confirmado; slots mantidos até expiração conservadora.",
          );
        warnings.push(`${source.platform}: ${err.message}`);
        return null;
      }
    })();
    if (run) runs.push(run);
  }
  if (!runs.length)
    throw new SearchError(
      warnings.join(" ") || "Nenhuma coleta social foi iniciada.",
    );
  const job = issueJob(
    {
      query,
      location,
      count,
      runs,
      warnings,
      executionKey: deps.executionKey || "",
      userId: deps.userId || null,
      expiresAt: Date.now() + 30 * 60 * 1000,
    },
    token,
  );
  return {
    done: false,
    job,
    leads: [],
    meta: {
      intent: "b2c_consumer",
      summary: `Coleta social iniciada em ${runs.length} origens públicas.`,
      targetAudience: "Autores com intenção textual e região declarada",
      warnings,
    },
  };
}
export async function pollSocialRadar(body, deps = {}) {
  const token = deps.apifyToken ?? process.env.APIFY_API_TOKEN;
  if (!token) throw new SearchError("APIFY_API_TOKEN ausente.", 503);
  const job = verifyJob(body.job, token);
  if (job.userId && job.userId !== deps.userId)
    throw new SearchError("Esta coleta pertence a outra conta.", 403);
  const warnings = [...job.warnings],
    leads = [],
    regionalUnconfirmed = [],
    marketplaceSignals = [],
    statuses = [],
    reports = [],
    seen = new Set();
  await Promise.all(
    job.runs.map(async (run) => {
      const report = sourceReport(run.platform, {
        kind: ["shopee", "mercado_livre"].includes(run.platform)
          ? "market"
          : "content",
        url: run.url,
        runId: run.runId,
        consulted: true,
        status: "running",
      });
      reports.push(report);
      try {
        const data = await api(
            `actor-runs/${encodeURIComponent(run.runId)}`,
            token,
            {},
            deps,
          ),
          status = data.data?.status;
        if (Number.isFinite(data.data?.usageTotalUsd))
          report.providerCostUsd = data.data.usageTotalUsd;
        report.actorTerminal = terminal.has(status);
        if (!status)
          throw new SearchError("Resposta Apify sem status da coleta.");
        statuses.push({ platform: run.platform, status });
        if (status !== "SUCCEEDED") {
          if (terminal.has(status)) {
            report.status = "failed";
            report.errors.push(status);
          }
          if (terminal.has(status))
            warnings.push(`${run.platform}: coleta terminou com ${status}.`);
          return;
        }
        const id = data.data.defaultDatasetId;
        if (!id) throw new SearchError("Dataset não encontrado.");
        const rows = [];
        let total = null;
        for (let page = 0; page < 2; page++) {
          const response = await (deps.fetcher || fetch)(
            `https://api.apify.com/v2/datasets/${encodeURIComponent(id)}/items?clean=true&format=json&limit=100&offset=${page * 100}`,
            {
              headers: { Authorization: `Bearer ${token}` },
              signal: AbortSignal.timeout(10000),
            },
          );
          if (!response.ok)
            throw new SearchError(`Apify respondeu HTTP ${response.status}.`);
          const batch = await response.json();
          if (!Array.isArray(batch))
            throw new SearchError("Dataset incompatível.");
          rows.push(...batch);
          const header = response.headers?.get?.("x-apify-pagination-total");
          if (
            header !== null &&
            header !== undefined &&
            Number.isFinite(Number(header))
          )
            total = Number(header);
          if (batch.length < 100) break;
        }
        report.pages = Math.ceil(rows.length / 100) || 1;
        report.providerTotal = total;
        if (!Array.isArray(rows))
          throw new SearchError("Dataset incompatível.");
        report.received = rows.length;
        report.discarded.fonte_invalida = rows.filter(
          (r) => r.error || r.errorCode,
        ).length;
        if (report.discarded.fonte_invalida) {
          report.status = "limited";
          report.errors.push(
            `${report.discarded.fonte_invalida} registros retornados com erro individual do Actor.`,
          );
        }
        report.status = rows.length ? "complete" : "no_matches";
        if (rows.length >= 200 || total > rows.length) {
          report.status = "limited";
          report.limits.push(
            "Dataset limitado a duas páginas/200 registros; coleta parcial.",
          );
        }
        if (["shopee", "mercado_livre"].includes(run.platform)) {
          report.kind = "market";
          const signals = normalizeMarketplaceRows(
            rows,
            run.platform,
            job.query,
            job.location,
          );
          report.marketSignals = signals.length;
          report.limits.push(
            `${signals.length} sinais de mercado; nenhum comprador identificado.`,
          );
          report.discarded.fonte_invalida += Math.max(
            0,
            rows.length - signals.length - report.discarded.fonte_invalida,
          );
          marketplaceSignals.push(...signals);
          return;
        }
        const records = normalizeSocialRows(rows, run.platform, run.url);
        report.normalized = records.length;
        report.unusableRows = rows.filter((r) => r.error || r.errorCode).length;
        const classified = classifyRecords(
          records,
          run.platform,
          job.query,
          job.location,
          report,
          { seen },
        );
        leads.push(...classified.leads);
        regionalUnconfirmed.push(...classified.regionalUnconfirmed);
      } catch (err) {
        report.status = "failed";
        report.errors.push(err.message);
        const previous = statuses.find((s) => s.platform === run.platform);
        if (previous) previous.status = "PROVIDER_ERROR";
        else
          statuses.push({ platform: run.platform, status: "PROVIDER_ERROR" });
        warnings.push(`${run.platform}: ${err.message}`);
      }
    }),
  );
  const unique = [
    ...new Map(
      leads.map((l) => [
        `${l.platform}:${l.authorProfileUrl || l.name}:${l.evidence.intent.recordId || l.intent}`,
        l,
      ]),
    ).values(),
  ].slice(0, job.count);
  const done =
    statuses.length === job.runs.length &&
    statuses.every(
      (s) => terminal.has(s.status) || s.status === "PROVIDER_ERROR",
    );
  const executionReport = finishReport(reports, unique, done);
  return {
    done,
    safeToRelease: reports.every((r) => r.actorTerminal),
    job: body.job,
    leads: unique,
    regionalUnconfirmed,
    marketplaceSignals,
    meta: {
      intent: "b2c_consumer",
      summary: executionReport.summary,
      executionReport,
      targetAudience: "Autores públicos; intenção classificada por regras",
      warnings: [
        ...warnings,
        "Marketplaces: perguntas anônimas e vendas históricas não identificam compradores nem sua localização.",
        "Perfil do autor é um canal de contato. Telefone só é exibido se oferecido pelo próprio autor. Participar de grupo local não comprova residência.",
      ],
      statuses,
    },
  };
}
export async function socialRadar(body, deps = {}) {
  const { startBuyerRadar, pollBuyerRadar } = await import("./buyerRadar.js");
  return body.action === "poll"
    ? pollBuyerRadar(body, deps)
    : startBuyerRadar(body, deps);
}
