import test from "node:test";
import assert from "node:assert/strict";
import {
  paidLimits,
  reserveBudgetState,
  memoryCacheGet,
  memoryCacheSet,
} from "../src/server/radarStore.js";
import { startBuyerRadar, pollBuyerRadar } from "../src/server/buyerRadar.js";
import {
  sourceReport,
  classifyRecords,
  finishReport,
} from "../src/server/radarReport.js";
import {
  collectPublicUrl,
  publicRecords,
} from "../src/server/publicBuyerSources.js";
import { intentAssessment } from "../src/server/purchaseIntent.js";
import {
  professionalContacts,
  structuralPhone,
} from "../src/server/professionalContacts.js";
const now = Date.parse("2026-10-13T12:00:00Z");
const record = (text) => ({
  text,
  name: "Public author",
  sourceUrl: "https://example.test/post/1",
  publishedAt: "2026-10-12",
  id: text,
});
const limits = {
  enabled: true,
  reserveUsd: 0.21,
  dailyUsd: 1,
  actorUsd: 0.1,
  maxActors: 2,
  serperQueries: 1,
  dailyQueries: 3,
  concurrent: 2,
  actorConcurrent: 4,
};
function storeFixture() {
  const data = new Map();
  let state = {};
  return {
    get: async (key) => data.get(key),
    put: async (key, value) =>
      data.set(key, { ...data.get(key), ...structuredClone(value) }),
    reserve: async (key, budget) => {
      if (data.has(key)) return { duplicate: true, execution: data.get(key) };
      state = reserveBudgetState(state, budget, key, now);
      data.set(key, { status: "starting", expiresAt: now + 900000 });
      return { duplicate: false };
    },
    finish: async (key) => {
      state.active = (state.active || []).filter((x) => x.key !== key);
    },
    data,
  };
}
test("paid APIs fail closed without budget or durable ledger, even if keys exist", async () => {
  let calls = 0;
  const fetcher = async () => {
    calls++;
    throw Error("must not call");
  };
  const body = { query: "ração", location: "Paracatu, MG", count: 4 };
  const a = await startBuyerRadar(body, {
    apifyToken: "fixture",
    fetcher,
    limits: paidLimits({}),
  });
  assert.equal(calls, 0);
  assert.equal(a.meta.executionReport.state, "unavailable");
  assert.match(a.meta.summary, /não comprova ausência/);
  const b = await startBuyerRadar(body, {
    apifyToken: "fixture",
    fetcher,
    limits,
    store: null,
  });
  assert.equal(calls, 0);
  assert.ok(
    b.meta.executionReport.sources.some((s) =>
      s.limits.some((t) => t.includes("persistente")),
    ),
  );
});
test("cache TTL is explicit and expired observations are not reused", () => {
  memoryCacheSet("fixture-ttl", { records: [] }, 1000, now);
  assert.equal(memoryCacheGet("fixture-ttl", now + 1).collectedAt, now);
  assert.equal(memoryCacheGet("fixture-ttl", now + 1000), null);
});
test("ledger enforces daily money/query caps, concurrent executions and concurrent Actor slots", () => {
  const s = reserveBudgetState({}, limits, "a", now);
  assert.equal(s.reservedUsd, 0.21);
  assert.throws(
    () => reserveBudgetState(s, { ...limits, dailyUsd: 0.3 }, "b", now),
    /diário/,
  );
  assert.throws(
    () => reserveBudgetState(s, { ...limits, dailyQueries: 1 }, "b", now),
    /consultas Serper/,
  );
  assert.throws(
    () => reserveBudgetState(s, { ...limits, concurrent: 1 }, "b", now),
    /execuções concorrentes/,
  );
  assert.throws(
    () => reserveBudgetState(s, { ...limits, actorConcurrent: 2 }, "b", now),
    /Actors concorrentes/,
  );
  assert.equal(
    reserveBudgetState({ ...s, active: [] }, limits, "b", now).reservedUsd,
    0.42,
  );
});
test("classification counts sellers, missing intent, products, dates, geography and duplicates separately", () => {
  const r = sourceReport("public", {
      received: 8,
      consulted: true,
      status: "complete",
    }),
    buyer = record(
      "Quero comprar ração. Moro em Paracatu MG. Meu email: eu@example.test",
    );
  const rows = [
    buyer,
    buyer,
    record("Vendo ração em Paracatu MG"),
    record("Avaliei ração em Paracatu MG"),
    record("Quero comprar tinta em Paracatu MG"),
    record("Quero comprar ração. Moro em Uberlândia MG"),
    record("Quero comprar ração. Grupo Paracatu MG"),
    { ...buyer, publishedAt: "2020-01-01", id: "old" },
  ];
  const out = classifyRecords(rows, "website", "ração", "Paracatu, MG", r, {
    now,
  });
  assert.equal(out.leads.length, 1);
  assert.equal(out.regionalUnconfirmed.length, 1);
  assert.equal(out.leads[0].email, "eu@example.test");
  for (const reason of [
    "vendedor",
    "intencao_ausente",
    "produto",
    "regiao_divergente",
    "regiao_desconhecida",
    "duplicidade",
    "data",
  ])
    assert.equal(r.discarded[reason], 1, reason);
  assert.equal(
    classifyRecords(
      [
        record(
          "Quero comprar ração. Moro em Paracatu MG. Loja: contato@example.test",
        ),
      ],
      "website",
      "ração",
      "Paracatu MG",
      sourceReport("x"),
      { now },
    ).leads[0].email,
    "",
  );
});
test("negations/completed purchases never count and neighborhood group alone is not residence", () => {
  for (const text of [
    "Não procuro ração",
    "Já comprei ração",
    "Pedido recebido de ração",
    "Vendo ração, quem vende mais?",
  ])
    assert.equal(intentAssessment(text, "ração").qualified, false, text);
  assert.equal(
    intentAssessment("Quem vende ração para cachorro?", "ração para cão")
      .qualified,
    true,
  );
  assert.equal(
    intentAssessment("Preciso de orçamento de ração", "ração").qualified,
    true,
  );
});
test("public feeds/JSON-LD preserve author boundaries; anonymous HTML never fabricates buyers", () => {
  const feed =
    "<rss><channel><item><title>Pedido</title><author>Ana</author><description>Quero comprar ração. Moro em Paracatu MG</description><link>https://example.test/1</link></item></channel></rss>";
  assert.equal(publicRecords(feed, "https://example.test/feed")[0].name, "Ana");
  const records = publicRecords(
    "<p>Quero comprar ração, moro em Paracatu MG, 34999999999</p>",
    "https://example.test",
  );
  const r = sourceReport("x");
  assert.equal(
    classifyRecords(records, "website", "ração", "Paracatu MG", r, { now })
      .leads.length,
    0,
  );
  assert.equal(r.discarded.autor_ausente, 1);
});
test("allowlist, robots and login gates block public collection", async () => {
  const old = process.env.BLITZ_PUBLIC_ALLOWED_HOSTS;
  process.env.BLITZ_PUBLIC_ALLOWED_HOSTS = "example.test";
  try {
    await assert.rejects(collectPublicUrl("https://other.test"), /autorizada/);
    await assert.rejects(
      collectPublicUrl("https://example.test/post", {
        readPage: async (url) => ({ url, html: "User-agent: *\nDisallow: /" }),
      }),
      /robots/,
    );
    await assert.rejects(
      collectPublicUrl("https://example.test/post", {
        readPage: async (url) => ({
          url,
          html: url.endsWith("robots.txt")
            ? "User-agent: *\nDisallow:"
            : "<title>Login required</title>",
        }),
      }),
      /login ou CAPTCHA/,
    );
  } finally {
    if (old === undefined) delete process.env.BLITZ_PUBLIC_ALLOWED_HOSTS;
    else process.env.BLITZ_PUBLIC_ALLOWED_HOSTS = old;
  }
});
test("multiple URLs on one platform use queue, persistent dedup and report actual provider costs", async () => {
  const store = storeFixture();
  let starts = 0;
  const fetcher = async (url) => ({
    ok: true,
    json: async () => {
      if (url.endsWith("/users/me/limits"))
        return {
          data: {
            limits: { maxMonthlyUsageUsd: 100 },
            current: { monthlyUsageUsd: 0 },
          },
        };
      if (url.includes("/acts/") && !url.includes("/runs?"))
        return { data: { pricingInfos: [{ pricingModel: "PAY_PER_EVENT" }] } };
      if (url.includes("/runs?")) return { data: { id: "run-" + ++starts } };
      if (url.includes("/actor-runs/"))
        return {
          data: {
            status: "SUCCEEDED",
            defaultDatasetId: url.includes("run-1") ? "a" : "b",
            usageTotalUsd: 0.02,
          },
        };
      if (url.includes("/datasets/"))
        return [
          {
            text: "Quero comprar ração. Moro em Paracatu MG",
            ownerUsername: "source_author",
            id: url.includes("/a/") ? "1" : "2",
          },
        ];
      throw Error("unexpected");
    },
  });
  const body = {
    query: "ração",
    location: "Paracatu MG",
    count: 4,
    sourceUrls: [
      "https://www.instagram.com/p/FIRST/",
      "https://www.instagram.com/p/SECOND/",
    ],
  };
  const deps = {
    userId: "u",
    store,
    limits,
    apifyToken: "fixture",
    serperKey: "",
    fetcher,
    now,
  };
  const [a, b] = await Promise.all([
    startBuyerRadar(body, deps),
    startBuyerRadar(body, deps),
  ]);
  assert.equal(a.job, b.job);
  assert.equal(starts, 2);
  const done = await pollBuyerRadar({ job: a.job }, deps);
  assert.equal(done.leads.length, 2);
  assert.equal(done.done, true);
  assert.ok(
    done.meta.executionReport.sources.filter((s) => s.providerCostUsd === 0.02)
      .length === 2,
  );
  await startBuyerRadar(body, deps);
  assert.equal(starts, 2);
});
test("failed provider is partial/unavailable, never claimed complete", () => {
  const failed = sourceReport("Apify", {
    consulted: true,
    status: "failed",
    errors: ["403"],
  });
  assert.equal(finishReport([failed], []).state, "unavailable");
  assert.equal(
    finishReport(
      [sourceReport("public", { consulted: true, status: "complete" }), failed],
      [],
    ).state,
    "partial",
  );
});
test("professional evidence separates general corporate contact from named professional, without QSA inference", () => {
  const data = {
    "@type": "Organization",
    name: "Tintas Fixture",
    employee: [
      {
        "@type": "Person",
        name: "Ana",
        jobTitle: "Gerente de compras",
        telephone: "(34) 3333-1234",
        email: "ana@fixture.test",
      },
      { "@type": "Person", name: "Sócio sem cargo" },
    ],
  };
  const p = professionalContacts(
    `<script type="application/ld+json">${JSON.stringify(data)}</script>`,
    "https://fixture.test/team",
    "Tintas Fixture",
  );
  assert.equal(p.length, 1);
  assert.equal(p[0].role, "Gerente de compras");
  assert.ok(p[0].evidence.phone.excerpt.includes("Ana"));
  assert.equal(p[0].buyerAuthority, "not_confirmed");
  assert.equal(
    professionalContacts(
      `<script type="application/ld+json">${JSON.stringify({ ...data, name: "Outra" })}</script>`,
      "https://fixture.test",
      "Tintas Fixture",
    ).length,
    0,
  );
  assert.equal(structuralPhone("(34) 3333-1234").e164, "+553433331234");
  assert.equal(structuralPhone("(34) 3333-1234").activity, "not_tested");
});
test("free source cache preserves original collection time in field evidence and avoids paid calls", async () => {
  const old = process.env.BLITZ_PUBLIC_ALLOWED_HOSTS;
  process.env.BLITZ_PUBLIC_ALLOWED_HOSTS = "cache.test";
  let pages = 0,
    calls = 0;
  const body = {
    query: "ração",
    location: "Paracatu MG",
    count: 1,
    sourceUrls: ["https://cache.test/post"],
  };
  const deps = {
    userId: "cache-user",
    now,
    limits: paidLimits({}),
    fetcher: async () => {
      calls++;
      throw Error("paid");
    },
    readPage: async (url) => {
      pages++;
      return {
        url,
        html: url.endsWith("robots.txt")
          ? "User-agent: *\nDisallow:"
          : `<script type="application/ld+json">${JSON.stringify({ "@type": "SocialMediaPosting", text: "Preciso de ração. Moro em Paracatu MG", author: { name: "Autor original" }, datePublished: "2026-10-12" })}</script>`,
      };
    },
  };
  try {
    const a = await startBuyerRadar(body, deps),
      b = await startBuyerRadar(body, { ...deps, now: now + 1000 });
    assert.equal(a.leads.length, 1);
    assert.equal(pages, 2);
    assert.equal(calls, 0);
    assert.equal(b.meta.executionReport.sources[0].cacheHit, true);
    assert.equal(
      b.leads[0].evidence.name.retrievedAt,
      a.leads[0].evidence.name.retrievedAt,
    );
  } finally {
    if (old === undefined) delete process.env.BLITZ_PUBLIC_ALLOWED_HOSTS;
    else process.env.BLITZ_PUBLIC_ALLOWED_HOSTS = old;
  }
});
test("paid provider failure records source errors and never fabricates buyers or a completed collection", async () => {
  const store = storeFixture();
  const result = await startBuyerRadar(
    {
      query: "ração",
      location: "Paracatu MG",
      sourceUrls: ["https://www.instagram.com/p/FAIL/"],
    },
    {
      userId: "fail",
      store,
      limits,
      apifyToken: "fixture",
      fetcher: async () => ({ ok: false, status: 403 }),
      now,
    },
  );
  assert.equal(result.leads.length, 0);
  assert.equal(result.meta.executionReport.state, "unavailable");
  assert.ok(
    result.meta.executionReport.sources.some((s) =>
      s.errors.some((e) => e.includes("403")),
    ),
  );
});
test("paid Actor with unproven billing is blocked before a run and missing permit never calls API", async () => {
  const { startSocialRadar } = await import("../src/server/socialRadar.js");
  let runs = 0;
  const fetcher = async (url) => {
    if (url.includes("/runs?")) runs++;
    return {
      ok: true,
      json: async () => ({
        data: { pricingInfos: [{ pricingModel: "PRICE_PER_DATASET_ITEM" }] },
      }),
    };
  };
  await assert.rejects(
    startSocialRadar(
      {
        query: "ração",
        location: "Paracatu MG",
        sourceUrls: ["https://www.instagram.com/p/BILLING/"],
      },
      { apifyToken: "fixture", fetcher },
    ),
    /orçamento/,
  );
  assert.equal(runs, 0);
  const reports = [];
  await assert.rejects(
    startSocialRadar(
      {
        query: "ração",
        location: "Paracatu MG",
        sourceUrls: ["https://www.instagram.com/p/BILLING/"],
      },
      { paidPermit: limits, apifyToken: "fixture", fetcher, reports },
    ),
    /modelo de preço/,
  );
  assert.equal(runs, 0);
  assert.equal(reports[0].status, "failed");
});
test("dataset pagination is bounded and total/cutoff are explicit", async () => {
  const { pollSocialRadar, issueJob } = await import(
    "../src/server/socialRadar.js"
  );
  let pages = 0;
  const job = issueJob(
    {
      query: "ração",
      location: "Paracatu MG",
      count: 4,
      runs: [
        {
          platform: "instagram",
          runId: "fixture",
          url: "https://www.instagram.com/p/PAGES/",
        },
      ],
      warnings: [],
      expiresAt: Date.now() + 10000,
    },
    "fixture",
  );
  const fetcher = async (url) =>
    url.includes("/actor-runs/")
      ? {
          ok: true,
          json: async () => ({
            data: { status: "SUCCEEDED", defaultDatasetId: "fixture" },
          }),
        }
      : {
          ok: true,
          headers: { get: () => 250 },
          json: async () => {
            pages++;
            return Array.from({ length: 100 }, (_, i) => ({
              id: `${pages}-${i}`,
              text: "Vendo ração",
            }));
          },
        };
  const r = await pollSocialRadar({ job }, { apifyToken: "fixture", fetcher });
  assert.equal(pages, 2);
  const source = r.meta.executionReport.sources[0];
  assert.equal(source.received, 200);
  assert.equal(source.providerTotal, 250);
  assert.equal(source.status, "limited");
  assert.equal(source.discarded.vendedor, 200);
});
test("uncertain Actor start retains concurrency reservation instead of reopening paid capacity", async () => {
  const store = storeFixture();
  let finishes = 0;
  const finish = store.finish;
  store.finish = async (key) => {
    finishes++;
    return finish(key);
  };
  const fetcher = async (url) => {
    if (url.includes("/runs?")) throw Error("network timeout");
    return {
      ok: true,
      json: async () =>
        url.endsWith("/limits")
          ? {
              data: {
                limits: { maxMonthlyUsageUsd: 10 },
                current: { monthlyUsageUsd: 0 },
              },
            }
          : { data: { pricingInfos: [{ pricingModel: "PAY_PER_EVENT" }] } },
    };
  };
  const r = await startBuyerRadar(
    {
      query: "ração",
      location: "Paracatu MG",
      sourceUrls: ["https://www.instagram.com/p/UNCERTAIN/"],
    },
    { store, limits, userId: "uncertain", apifyToken: "fixture", fetcher, now },
  );
  assert.equal(finishes, 0);
  assert.ok(r.meta.executionReport.sources.some((s) => s.startUncertain));
  assert.notEqual(r.meta.executionReport.state, "complete");
});
