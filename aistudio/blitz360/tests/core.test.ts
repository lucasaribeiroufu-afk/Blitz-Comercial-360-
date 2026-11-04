import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Repository, Row, Tx } from "../src/server/repository";
import {
  ApifyService,
  normalizePlaces,
  searchInput,
} from "../src/server/apify";
import { CrmService } from "../src/server/crm";
import {
  calculatePrice,
  externalProposal,
  whatsappLink,
} from "../src/utils/commercial";
import { createApi } from "../server";

class MemoryRepository implements Repository {
  rows = new Map<string, Row>();
  tail = Promise.resolve();
  writes = 0;
  failAt = Infinity;
  key(u: string, c: string, id: string) {
    return `${u}/${c}/${id}`;
  }
  seed(u: string, c: string, row: Row) {
    this.rows.set(this.key(u, c, row.id), structuredClone(row));
  }
  async get(u: string, c: string, id: string) {
    return structuredClone(this.rows.get(this.key(u, c, id)) || null);
  }
  async list(u: string, c: string) {
    return structuredClone(
      [...this.rows.entries()]
        .filter(([k]) => k.startsWith(`${u}/${c}/`))
        .map(([, v]) => v),
    );
  }
  async transaction<T>(u: string, fn: (t: Tx) => Promise<T>): Promise<T> {
    const before = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((r) => {
      release = r;
    });
    await before;
    const pending = new Map<string, Row>();
    try {
      const result = await fn({
        get: (c, id) => this.get(u, c, id),
        set: (c, id, data) => {
          pending.set(this.key(u, c, id), structuredClone({ ...data, id }));
        },
      });
      if (++this.writes === this.failAt)
        throw new Error("injected persistence failure");
      for (const [k, v] of pending) this.rows.set(k, v);
      return result;
    } finally {
      release();
    }
  }
}
function query(extra: any = {}) {
  return {
    product: "iodo 10%",
    buyerSegment: "distribuidoras agropecuárias",
    locationQuery: "Brasil",
    count: 6,
    budgetUsd: 0.1,
    requestId: randomUUID(),
    ...extra,
  };
}
function provider() {
  const calls: { url: string; init: RequestInit }[] = [];
  let status = "RUNNING",
    postCount = 0;
  const transport: typeof fetch = async (url: any, init: any = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).includes("/actors/")) {
      postCount++;
      return Response.json({
        data: {
          id: `run-${postCount}`,
          defaultDatasetId: `dataset-${postCount}`,
          status,
        },
      });
    }
    if (String(url).includes("/datasets/"))
      return Response.json([
        {
          title: "Empresa da fonte",
          phone: "+55 (34) 3333-4444",
          address: "Endereço publicado",
          url: "https://www.google.com/maps/place/empresa",
          placeId: "place-1",
        },
      ]);
    return Response.json({ data: { status } });
  };
  return {
    calls,
    transport,
    setStatus: (s: string) => {
      status = s;
    },
  };
}
const cfg = { token: "test-only-provider-token", maxRunUsd: 0.5, dailyUsd: 5 };

test("normalization accepts actual names and Maps URLs, and never fills missing phone, CNPJ, rating, email or buyer", () => {
  const results = normalizePlaces(
    [
      { title: "Empresa A", url: "https://www.google.com/maps/place/A" },
      { title: "Sem fonte" },
      { title: "Malicioso", url: "https://google.com.evil.test/maps/A" },
      { url: "https://www.google.com/maps/place/B" },
    ],
    12345,
  );
  assert.equal(results.length, 1);
  assert.equal(results[0].phone, "");
  assert.equal(results[0].capturedAt, 12345);
  for (const field of [
    "cnpj",
    "decisionMaker",
    "email",
    "rating",
    "demandTimeframe",
  ])
    assert.equal(results[0][field], undefined);
});
test("country is preserved and count / budget are strictly validated", () => {
  assert.equal(searchInput(query(), 0.5).locationQuery, "Brasil");
  for (const count of [0, 21, 1.2, NaN, Infinity])
    assert.throws(() => searchInput(query({ count }), 0.5));
  for (const budgetUsd of [-1, 0, NaN, Infinity, 0.51])
    assert.throws(() => searchInput(query({ budgetUsd }), 0.5));
});
test("missing Apify token fails before persistence or external calls", async () => {
  const repo = new MemoryRepository();
  const p = provider();
  const s = new ApifyService(repo, { ...cfg, token: undefined }, p.transport);
  await assert.rejects(
    s.start("A", query()),
    (e: any) => e.status === 503 && e.code === "APIFY_NOT_CONFIGURED",
  );
  assert.equal(p.calls.length, 0);
  assert.equal(repo.rows.size, 0);
});
test("reservation failure prevents external execution", async () => {
  const repo = new MemoryRepository();
  repo.failAt = 1;
  const p = provider();
  await assert.rejects(
    new ApifyService(repo, cfg, p.transport).start("A", query()),
  );
  assert.equal(p.calls.length, 0);
});
test("real lifecycle uses correct actor input and cost query, scopes ownership and releases exactly once", async () => {
  const repo = new MemoryRepository(),
    p = provider(),
    s = new ApifyService(repo, cfg, p.transport),
    q = query();
  const row = await s.start("A", q);
  const url = new URL(p.calls[0].url),
    body = JSON.parse(String(p.calls[0].init.body));
  assert.equal(url.searchParams.get("maxTotalChargeUsd"), "0.1");
  assert.equal(url.searchParams.get("timeout"), "120");
  assert.equal(url.searchParams.get("maxItems"), "6");
  assert.equal(url.searchParams.has("token"), false);
  assert.equal(
    (p.calls[0].init.headers as any).Authorization,
    `Bearer ${cfg.token}`,
  );
  assert.deepEqual(body.searchStringsArray, ["distribuidoras agropecuárias"]);
  assert.equal(body.locationQuery, "Brasil");
  assert.equal(body.maxTotalChargeUsd, undefined);
  await assert.rejects(s.dataset("B", row.id), (e: any) => e.status === 404);
  const repeated = await s.start("A", q);
  assert.equal(repeated.id, row.id);
  assert.equal(p.calls.filter((c) => c.init.method === "POST").length, 1);
  await assert.rejects(
    s.start("A", { ...q, buyerSegment: "outra consulta" }),
    (e: any) => e.code === "REQUEST_CONFLICT",
  );
  p.setStatus("SUCCEEDED");
  await Promise.all(Array.from({ length: 10 }, () => s.status("A", row.id)));
  assert.equal((await repo.get("A", "quotas", "apify"))?.active, 0);
  const result = await s.dataset("A", row.id);
  assert.equal(result.leads.length, 1);
  assert.equal(result.leads[0].name, "Empresa da fonte");
  await s.abort("A", row.id);
  assert.equal((await repo.get("A", "quotas", "apify"))?.active, 0);
});
test("concurrent starts cannot exceed two slots", async () => {
  const repo = new MemoryRepository(),
    p = provider(),
    s = new ApifyService(repo, cfg, p.transport);
  const started = await Promise.allSettled(
    Array.from({ length: 15 }, () => s.start("A", query())),
  );
  assert.equal(started.filter((r) => r.status === "fulfilled").length, 2);
  assert.equal(p.calls.length, 2);
  assert.equal((await repo.get("A", "quotas", "apify"))?.active, 2);
});
test("ambiguous provider failure retains budget and blocks blind idempotent retry", async () => {
  const repo = new MemoryRepository();
  let calls = 0;
  const s = new ApifyService(repo, cfg, async () => {
    calls++;
    throw new Error("timeout after remote start");
  });
  const q = query();
  await assert.rejects(
    s.start("A", q),
    (e: any) => e.code === "START_UNCERTAIN",
  );
  const row = await s.start("A", q);
  assert.equal(row.status, "START_UNKNOWN");
  assert.equal(calls, 1);
  assert.equal((await repo.get("A", "quotas", "apify"))?.reserved, 0.1);
  assert.equal((await repo.get("A", "quotas", "apify"))?.active, 1);
});
test("ABORTING is not treated as ABORTED and does not free concurrency", async () => {
  const repo = new MemoryRepository(),
    p = provider(),
    s = new ApifyService(repo, cfg, p.transport),
    row = await s.start("A", query());
  p.setStatus("ABORTING");
  await s.abort("A", row.id);
  assert.equal((await repo.get("A", "quotas", "apify"))?.active, 1);
  p.setStatus("ABORTED");
  await s.status("A", row.id);
  assert.equal((await repo.get("A", "quotas", "apify"))?.active, 0);
});
test("daily budget is reserved conservatively across completed runs", async () => {
  const repo = new MemoryRepository(),
    p = provider(),
    s = new ApifyService(repo, { ...cfg, dailyUsd: 0.2 }, p.transport);
  p.setStatus("SUCCEEDED");
  await s.start("A", query());
  await s.start("A", query());
  await assert.rejects(s.start("A", query()), (e: any) => e.status === 429);
  assert.equal(p.calls.length, 2);
});
test("legacy phone formats dedupe without resetting CRM, and concurrent saves are idempotent", async () => {
  const repo = new MemoryRepository();
  repo.seed("A", "contacts", {
    id: "old",
    name: "Empresa",
    phone: "(34) 3333-4444",
    status: "qualified",
    notes: "Preservar",
    nextAction: "Retorno",
    estimatedValue: 200,
    createdAt: 10,
  });
  const crm = new CrmService(repo);
  const result = await crm.save("A", {
    manual: { name: "Empresa", phone: "+55 34 3333 4444" },
  });
  assert.equal(result.id, "old");
  const row = await repo.get("A", "contacts", "old");
  assert.equal(row?.status, "qualified");
  assert.equal(row?.notes, "Preservar");
  assert.equal(row?.estimatedValue, 200);
  await Promise.all(
    Array.from({ length: 10 }, () =>
      crm.save("B", { manual: { name: "Empresa B", phone: "1133334444" } }),
    ),
  );
  assert.equal((await crm.contacts("B")).length, 1);
  assert.equal((await crm.contacts("A")).length, 1);
});
test("shared phone with conflicting CNPJ requires review and never merges firms", async () => {
  const repo = new MemoryRepository(),
    crm = new CrmService(repo);
  await crm.save("A", {
    manual: { name: "Empresa A", phone: "3433334444", cnpj: "11222333000111" },
  });
  await assert.rejects(
    crm.save("A", {
      manual: {
        name: "Empresa B",
        phone: "+55 34 3333-4444",
        cnpj: "99888777000122",
      },
    }),
    (e: any) => e.code === "SHARED_PHONE_REVIEW",
  );
  assert.equal((await crm.contacts("A")).length, 1);
});
test("archive/restoration handles 601 legacy contacts, retains interactions and skips running searches / other UID", async () => {
  const repo = new MemoryRepository(),
    crm = new CrmService(repo);
  for (let i = 0; i < 601; i++)
    repo.seed("A", "contacts", {
      id: `c-${i}`,
      name: `Legacy ${i}`,
      status: "new",
      notes: "Original",
    });
  repo.seed("A", "interactions", {
    id: "i",
    contactId: "c-1",
    notes: "Original history",
  });
  repo.seed("B", "contacts", { id: "b", name: "Other user" });
  repo.seed("A", "apify_runs", { id: "done", status: "SUCCEEDED" });
  repo.seed("A", "apify_runs", { id: "active", status: "RUNNING" });
  const result = await crm.archive("A");
  assert.equal(result.contacts, 601);
  assert.equal(result.searches, 1);
  assert.equal(result.skippedRunning, 1);
  assert.equal((await crm.contacts("A")).length, 0);
  assert.equal((await crm.contacts("B")).length, 1);
  assert.equal((await crm.history("A", "c-1")).length, 1);
  const restored = await crm.restore("A", result.batchId);
  assert.equal(restored.restored, 602);
  assert.equal((await crm.contacts("A")).length, 601);
  assert.equal((await crm.restore("A", result.batchId)).restored, 0);
});
test("partially committed cleanup can resume the same batch without double counting", async () => {
  const repo = new MemoryRepository(),
    crm = new CrmService(repo);
  for (let i = 0; i < 250; i++)
    repo.seed("A", "contacts", { id: `c-${i}`, name: "Legacy" });
  repo.failAt = 3;
  await assert.rejects(crm.archive("A"));
  const inventory = await crm.inventory("A");
  assert.equal(inventory.contacts, 150);
  assert.equal(inventory.lastBatch?.position, 100);
  repo.failAt = Infinity;
  const result = await crm.archive("A", inventory.lastBatch!.id);
  assert.equal(result.contacts, 250);
  assert.equal((await crm.contacts("A")).length, 0);
  await assert.rejects(
    crm.restore("B", result.batchId),
    (e: any) => e.status === 404,
  );
});
test("only an explicit interaction changes new to contacted; notes alone do not", async () => {
  const repo = new MemoryRepository(),
    crm = new CrmService(repo);
  const c = await crm.save("A", { manual: { name: "Empresa" } });
  await crm.interact("A", c.id, { type: "note", notes: "Ainda não abordado" });
  assert.equal((await repo.get("A", "contacts", c.id))?.status, "new");
  await crm.interact("A", c.id, {
    type: "whatsapp",
    notes: "Mensagem enviada; aguardando retorno",
  });
  assert.equal((await repo.get("A", "contacts", c.id))?.status, "contacted");
});
test("pricing validates finite values and distinguishes margin / markup, and external proposals omit internal costs", () => {
  const p = {
    cost: 10,
    shipping: 0,
    insurance: 0,
    taxes: 0,
    commission: 0,
    fees: 0,
    margin: 20,
    quantity: 2,
    mode: "CIF" as const,
  };
  const r = calculatePrice(p);
  assert.equal(r.unit, 12.5);
  assert.equal(r.margin, 20);
  assert.equal(r.markup, 25);
  assert.equal(r.contribution, 5);
  for (const override of [
    { quantity: 0 },
    { quantity: 1.5 },
    { cost: NaN },
    { cost: Infinity },
    { cost: -1 },
    { taxes: 80, margin: 20 },
  ])
    assert.throws(() => calculatePrice({ ...p, ...override }));
  const proposal = externalProposal("Cliente", "Produto", p);
  assert.doesNotMatch(
    proposal,
    /custo|margem|markup|lucro|garantia|laudo|48h/i,
  );
  assert.match(proposal, /25,00/);
  assert.equal(whatsappLink("33334444"), "");
  assert.match(
    whatsappLink("(34) 3333-4444"),
    /^https:\/\/wa.me\/553433334444/,
  );
});
test("HTTP API rejects unauthenticated / invalid tokens, reports missing integration and isolates requests", async (t) => {
  const repo = new MemoryRepository();
  const p = provider();
  const app = createApi({
    repo,
    verify: async (token) => {
      if (token === "A" || token === "B") return token;
      throw new Error("invalid");
    },
    apify: new ApifyService(repo, { ...cfg, token: undefined }, p.transport),
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  t.after(() => new Promise<void>((r) => server.close(() => r())));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  assert.equal((await fetch(`${base}/api/contacts`)).status, 401);
  assert.equal(
    (
      await fetch(`${base}/api/contacts`, {
        headers: { Authorization: "Bearer invalid" },
      })
    ).status,
    401,
  );
  const res = await fetch(`${base}/api/searches`, {
    method: "POST",
    headers: { Authorization: "Bearer A", "Content-Type": "application/json" },
    body: JSON.stringify(query()),
  });
  assert.equal(res.status, 503);
  assert.equal((await res.json()).code, "APIFY_NOT_CONFIGURED");
  assert.equal(p.calls.length, 0);
  repo.seed("A", "contacts", { id: "private", name: "Private A", phone: "" });
  const b = await fetch(`${base}/api/contacts`, {
    headers: { Authorization: "Bearer B" },
  });
  assert.deepEqual(await b.json(), []);
  assert.equal(
    (
      await fetch(`${base}/api/ai/deep-search`, {
        method: "POST",
        headers: { Authorization: "Bearer A" },
      })
    ).status,
    410,
  );
});

test('simultaneous cleanup shares one resumable batch and preserves exact counts', async () => {
  const repo = new MemoryRepository(), crm = new CrmService(repo);
  for (let i = 0; i < 250; i++) repo.seed('A', 'contacts', { id: `c-${i}`, name: 'Legacy' });
  const results = await Promise.all([crm.archive('A'), crm.archive('A')]);
  assert.equal(results[0].batchId, results[1].batchId);
  assert.equal(results[0].contacts, 250); assert.equal(results[1].contacts, 250);
  assert.equal((await crm.contacts('A')).length, 0);
  assert.equal((await crm.restore('A', results[0].batchId)).restored, 250);
});
test('collected contacts must reference a real owned dataset lead', async () => {
  const repo = new MemoryRepository(), crm = new CrmService(repo);
  repo.seed('A', 'apify_runs', { id: 'r', uid: 'A', product: 'iodo 10%', leads: [{ name: 'Fonte real', sourceId: 'place-id', sourceUrl: 'https://www.google.com/maps/place/A', phone: '', location: '' }] });
  const saved = await crm.save('A', { requestId: 'r', sourceId: 'place-id', lead: { name: 'Inventado', phone: '9999' } });
  assert.equal((await repo.get('A', 'contacts', saved.id))?.name, 'Fonte real');
  await assert.rejects(crm.save('B', { requestId: 'r', sourceId: 'place-id' }), (e: any) => e.code === 'LEAD_NOT_COLLECTED');
});
