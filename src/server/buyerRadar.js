import {buyerLocation} from '../utils/searchScope.js';
import { SearchError, normalize } from "./verifiedSearch.js";
import { startSocialRadar, pollSocialRadar, verifyJob } from "./socialRadar.js";
import { productQuery } from "./purchaseIntent.js";
import {collectSocialWorker, socialPlatform} from "./socialWorker.js";
import { collectPublicUrl } from "./publicBuyerSources.js";
import {
  radarKey,
  memoryCacheGet,
  memoryCacheSet,
  createRadarStore,
  paidLimits,
} from "./radarStore.js";
import {
  sourceReport,
  classifyRecords,
  finishReport,
  manualSearchLinks,
  mentionKey,
} from "./radarReport.js";
const inflight = new Map();
const ttl = () =>
  Math.min(
    3600,
    Math.max(60, Number(process.env.BLITZ_RADAR_CACHE_SECONDS) || 900),
  ) * 1000;
function answer(
  leads,
  regionalUnconfirmed,
  sources,
  query,
  location,
  done = true,
  extra = {},
) {
  const visibleSources = sources.filter(
    (s) =>
      !(
        (s.source.startsWith("Apify ") &&
          sources.some((r) => r.source === s.source.slice(6))) ||
        (s.source === "Serper" && sources.some((r) => r.query))
      ),
  );
  const executionReport = finishReport(visibleSources, leads, done);
  executionReport.manualSearchLinks = manualSearchLinks(query, location);
  console.info(
    JSON.stringify({
      event: "blitz-radar-execution",
      query,
      location,
      state: executionReport.state,
      sources: visibleSources.map((s) => ({
        source: s.source,
        consulted: s.consulted,
        status: s.status,
        query: s.query,
        received: s.received,
        normalized: s.normalized,
        pages: s.pages,
        providerTotal: s.providerTotal,
        providerCredits: s.providerCredits,
        marketSignals: s.marketSignals,
        qualified: s.qualified,
        discarded: s.discarded,
        errors: s.errors,
        limits: s.limits,
        runId: s.runId,
        providerCostUsd: s.providerCostUsd,
        reservedUsd: s.reservedUsd,
        collectedAt: s.collectedAt,
        expiresAt: s.expiresAt,
      })),
    }),
  );
  return {
    done,
    leads,
    regionalUnconfirmed,
    marketplaceSignals: [],
    pendingSources: [],
    ...extra,
    meta: {
      intent: "b2c_consumer",
      summary: executionReport.summary,
      targetAudience:
        "Publicações públicas com intenção textual e evidência regional",
      executionReport,
      warnings: [
        "Intenção classificada por regras, não comprova compra atual. Grupo local e DDD não comprovam residência.",
        "Resultados da seção região não comprovada não são salvos automaticamente como compradores da cidade.",
      ],
    },
  };
}
export async function startBuyerRadar(body, deps = {}) {
  const query = productQuery(body.query),
    location = buyerLocation(body.location),
    count = Number(body.count ?? 30);
  if (
    !query ||
    query.length > 300 ||
    !location ||
    location.length > 160 ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > 100
  )
    throw new SearchError(
      "Informe produto, Brasil ou Cidade - UF e quantidade de 1 a 100.",
      400,
    );
  const manual = body.sourceUrls ?? [];
  if (
    !Array.isArray(manual) ||
    manual.length > 9 ||
    manual.some((u) => typeof u !== "string" || u.length > 500)
  )
    throw new SearchError("Informe até nove URLs públicas.", 400);
  const urls = [
    ...new Set([
      ...manual,
      ...String(process.env.BLITZ_PUBLIC_SOCIAL_URLS || "")
        .split(/[\n,]/)
        .filter(Boolean),
    ]),
  ];
  const key = radarKey({
    version: 3,
    userId: deps.userId || "",
    query: normalize(query),
    location: normalize(location),
    count,
    urls: [...urls].sort(),
    markets: !!body.includeMarketplaces,
    worker: !!process.env.SOCIAL_WORKER_URL,
  });
  if (inflight.has(key)) return inflight.get(key);
  const promise = execute(
    { ...body, query, location, count, sourceUrls: urls },
    key,
    deps,
  );
  inflight.set(key, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(key);
  }
}
async function execute(body, key, deps) {
  deps = {...deps, deadline: Math.min(deps.deadline || Infinity, Date.now()+45000)};
  const sources = [],
    leads = [],
    unknown = [],
    seen = new Set(),
    now = deps.now || Date.now();
  let store;
  try {
    store = deps.store !== undefined ? deps.store : createRadarStore();
  } catch {
    sources.push(
      sourceReport("Armazenamento persistente", {
        status: "blocked",
        errors: [
          "Configuração de armazenamento inválida; etapa paga bloqueada.",
        ],
      }),
    );
  }
  try {
    const old = store && (await store.get(key));
    if (old?.response && old.expiresAt > now) {
      const response = old.response;
      response.meta.executionReport.reusedExecution = true;
      return response;
    }
    if (old?.status === "starting" && old.expiresAt > now)
      throw new SearchError(
        "Esta execução já foi reservada. Aguarde; uma nova cobrança não será iniciada.",
        409,
      );
  } catch (err) {
    if (err instanceof SearchError) throw err;
    store = null;
    sources.push(
      sourceReport("Armazenamento persistente", {
        status: "blocked",
        errors: ["Armazenamento indisponível; etapa paga bloqueada."],
      }),
    );
  }
  let pendingSources = [];
  const socialUrls = body.sourceUrls.filter(socialPlatform);
  function consumeWorker(worker) {
    pendingSources = [...pendingSources,...(worker.pending || [])].slice(0,9);
    for (const raw of worker.reports) {
      const report = sourceReport(raw.source || "Worker social", {...raw, kind:"content"});
      // Discard counters must be owned by the classifier, not trusted from a worker.
      report.discarded = sourceReport("x").discarded;
      sources.push(report);
      const rows = worker.records.filter(r => r.platform === raw.platform && (r.collectionUrl || r.sourceUrl) === raw.url);
      report.normalized = rows.length;
      const classified = classifyRecords(rows, raw.platform, body.query, body.location, report, {seen,now});
      leads.push(...classified.leads);unknown.push(...classified.regionalUnconfirmed);
    }
  }
  if(socialUrls.length || !body.sourceUrls.length) try {
    const worker = await (deps.collectWorker || collectSocialWorker)({...body, sourceUrls:socialUrls},deps);
    consumeWorker(worker);
  } catch (err) {
    sources.push(sourceReport("Worker social",{status:"blocked",errors:[err.message]}));
  }
  // Generic HTTP is for non-social feeds; social URLs use their own public DOM adapters.
  const publicUrls = body.sourceUrls.filter(url => !socialPlatform(url));
  const readLimit = 2;
  for (const url of publicUrls.slice(0, readLimit)) {
    const report = sourceReport("Página/feed público", { url });
    sources.push(report);
    const cacheKey = radarKey({ userId: deps.userId || "", url }),
      cached = memoryCacheGet(cacheKey, now);
    try {
      const data =
        cached ||
        (await collectPublicUrl(url, {
          ...deps,
          onAttempt: () => {
            report.consulted = true;
          },
        }));
      report.consulted = true;
      report.received = data.records.length;
      report.status = report.received ? "complete" : "no_matches";
      report.cacheHit = !!cached;
      report.collectedAt = cached?.collectedAt || now;
      report.expiresAt = cached?.expiresAt || now + ttl();
      if (!cached) memoryCacheSet(cacheKey, data, ttl(), now);
      if (data.records.length >= 100) {
        report.status = "limited";
        report.limits.push("Leitura limitada a 100 blocos por fonte.");
      }
      const classified = classifyRecords(
        data.records,
        "website",
        body.query,
        body.location,
        report,
        { seen, now, retrievedAt: new Date(report.collectedAt).toISOString() },
      );
      leads.push(...classified.leads);
      unknown.push(...classified.regionalUnconfirmed);
    } catch (err) {
      report.status = "blocked";
      report.errors.push(
        err instanceof SearchError
          ? err.message
          : "Falha de leitura pública, timeout ou bloqueio HTTP.",
      );
    }
  }
  if (publicUrls.length > readLimit)
    sources.push(
      sourceReport("Páginas adicionais", {
        status: "limited",
        limits: [
          `Até ${readLimit} URLs públicas por execução; ${publicUrls.length - readLimit} não lidas nesta etapa.`,
        ],
      }),
    );
  if (!body.sourceUrls.length)
    sources.push(
      sourceReport("Página/feed público", {
        limits: ["Nenhuma URL fornecida. Use os links de descoberta manual."],
      }),
    );
  sources.push(
    sourceReport("Serper", {
      kind: "discovery",
      limits: [
        "Descoberta paga ainda não consultada; não é fonte de contato pessoal.",
      ],
    }),
  );
  for (const platform of ["facebook", "instagram", "tiktok"])
    sources.push(
      sourceReport(`Apify ${platform}`, {
        limits: ["Ainda não consultado nesta execução."],
      }),
    );
  if (body.includeMarketplaces)
    for (const platform of ["shopee", "mercado_livre"])
      sources.push(
        sourceReport(`Apify ${platform}`, {
          kind: "market",
          limits: [
            "Não consultado; produtos/perguntas não são compradores identificados.",
          ],
        }),
      );
  let result = answer(
    leads.slice(0, body.count),
    unknown,
    sources,
    body.query,
    body.location,
  );
  if (leads.length >= body.count) {result.pendingSources = pendingSources;return result;}
  if (pendingSources.length) {
    result.pendingSources = pendingSources;
  }
  const respond = () => answer(leads, unknown, sources, body.query, body.location, true, {pendingSources});
  const limits = deps.limits || paidLimits(),
    token = deps.apifyToken ?? process.env.APIFY_API_TOKEN;
  const gate = sourceReport("Etapa paga", {
    kind: "control",
    status: "blocked",
    balance: "saldo não verificado",
    limits: [],
  });
  sources.push(gate);
  if (!limits.enabled) {
    gate.limits.push(
      "Orçamento ausente ou inconsistente; nenhuma API paga foi chamada.",
    );
    return respond();
  }
  if (!store) {
    gate.limits.push(
      "Controle persistente não configurado; APIs pagas bloqueadas para garantir teto diário e duplicidade na Vercel.",
    );
    return respond();
  }
  if (!token) {
    gate.limits.push("APIFY_API_TOKEN ausente.");
    return respond();
  }
  // Conservative monetary reservation persists even on timeouts; uncertain charges are never refunded automatically.
  let reservation;
  try {
    reservation = await store.reserve(key, limits, now);
  } catch (err) {
    gate.limits.push(err.message);
    return respond();
  }
  if (reservation.duplicate) {
    if (reservation.execution.response) return reservation.execution.response;
    throw new SearchError(
      "Execução já iniciada; aguarde a resposta anterior.",
      409,
    );
  }
  gate.reservedUsd = limits.reserveUsd;
  gate.limits.push(
    `Até ${limits.maxActors} Actors, ${limits.serperQueries} consultas Serper e duas páginas/200 linhas por dataset.`,
  );
  gate.limits.push(
    "Reserva conservadora, não é custo faturado. Saldo não é presumido gratuito.",
  );
  const deadline = Math.min(deps.deadline, Date.now() + 24000);
  // Documented account limits/usage endpoint is consulted, but limits are not a wallet balance.
  try {
    const response = await (deps.fetcher || fetch)(
      "https://api.apify.com/v2/users/me/limits",
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!response.ok) throw Error();
    const data = await response.json();
    gate.accountLimitsChecked = true;
    const available =
      Number(data.data?.limits?.maxMonthlyUsageUsd) -
      Number(data.data?.current?.monthlyUsageUsd);
    if (Number.isFinite(available)) {
      gate.balance =
        "Saldo de créditos não verificado; limite mensal de uso consultado.";
      gate.remainingUsageLimitUsd = Math.max(0, available);
      if (available < limits.reserveUsd)
        throw new SearchError(
          "Limite de uso informado pelo Apify insuficiente.",
          402,
        );
    }
  } catch (err) {
    gate.errors.push("Não foi possível confirmar disponibilidade de créditos.");
    if (err instanceof SearchError) {
      gate.limits.push(err.message);
      await store.finish(key);
      return respond();
    }
  }
  try {
    const paid = await startSocialRadar(
      { ...body, sourceUrls: body.sourceUrls.slice(0, 9) },
      {
        ...deps,
        deadline,
        paidPermit: limits,
        collectDiscovered: async(urls) => {
          const worker = await (deps.collectWorker || collectSocialWorker)({...body,sourceUrls:urls}, {...deps,deadline});
          consumeWorker(worker);
          return leads.length >= body.count;
        },
        reports: sources,
        executionKey: key,
      },
    );
    gate.status = "complete";
    gate.consulted = true;
    result = answer(
      leads,
      unknown,
      sources,
      body.query,
      body.location,
      !paid.job,
      { job: paid.job, pendingSources },
    );
    await store.put(key, {
      response: result,
      freeLeads: leads,
      freeUnknown: unknown,
      sources,
      expiresAt: now + ttl(),
    });
    if (!paid.job) await store.finish(key);
    return result;
  } catch (err) {
    gate.status = "failed";
    gate.errors.push(
      err instanceof SearchError ? err.message : "Falha da etapa paga.",
    );
    result = respond();
    await store.put(key, { response: result, expiresAt: now + ttl() });
    if (!sources.some((s) => s.startUncertain || s.runId))
      await store.finish(key);
    return result;
  }
}
export async function pollBuyerRadar(body, deps = {}) {
  const token = deps.apifyToken ?? process.env.APIFY_API_TOKEN;
  if (!token) throw new SearchError("APIFY_API_TOKEN ausente.", 503);
  const job = verifyJob(body.job, token);
  if (job.userId && job.userId !== deps.userId)
    throw new SearchError("Esta coleta pertence a outra conta.", 403);
  const store = deps.store !== undefined ? deps.store : createRadarStore();
  if (!store || !job.executionKey)
    throw new SearchError(
      "Estado persistente desta execução indisponível. Não inicie nova cobrança; confira o run no Apify.",
      503,
    );
  const old = await store.get(job.executionKey);
  if (!old) throw new SearchError("Relatório persistente indisponível.", 503);
  if (old.response?.done) return old.response;
  const paid = await pollSocialRadar(body, deps);
  const reports = old.sources
    .filter(
      (s) =>
        !paid.meta.executionReport.sources.some(
          (r) => r.runId && r.runId === s.runId,
        ),
    )
    .concat(paid.meta.executionReport.sources);
  const seen = new Set(),
    leads = [];
  for (const lead of [...old.freeLeads, ...paid.leads]) {
    const key = mentionKey(lead);
    if (seen.has(key)) {
      const source =
        reports.find((s) => s.runId === lead.evidence.intent?.recordId) ||
        reports.at(-1);
      source.discarded.duplicidade++;
      continue;
    }
    seen.add(key);
    leads.push(lead);
  }
  const result = answer(
    leads.slice(0, job.count),
    [...old.freeUnknown, ...paid.regionalUnconfirmed],
    reports,
    job.query,
    job.location,
    paid.done,
    { job: body.job, marketplaceSignals: paid.marketplaceSignals, pendingSources:old.response?.pendingSources || [] },
  );
  await store.put(job.executionKey, {
    response: result,
    expiresAt: Date.now() + ttl(),
  });
  if (paid.done && paid.safeToRelease && !reports.some((s) => s.startUncertain))
    await store.finish(job.executionKey);
  return result;
}
