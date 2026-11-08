import type { Repository, Row } from "./repository";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export const TERMINAL = new Set([
  "SUCCEEDED",
  "FAILED",
  "ABORTED",
  "TIMED-OUT",
]);
export const ACTOR = "compass~crawler-google-places";
export interface SearchInput {
  product: string;
  buyerSegment: string;
  locationQuery: string;
  count: number;
  budgetUsd: number;
  requestId: string;
}
export function text(v: unknown, max = 160): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}
export function searchInput(body: any, maxBudget: number): SearchInput {
  if (
    !body ||
    typeof body !== "object" ||
    typeof body.buyerSegment !== "string" ||
    body.buyerSegment.length > 160 ||
    typeof body.locationQuery !== "string" ||
    body.locationQuery.length > 160
  )
    throw new ApiError(
      400,
      "INVALID_SEARCH",
      "Segmento e região devem ter até 160 caracteres.",
    );
  const buyerSegment = text(body.buyerSegment);
  const locationQuery = text(body.locationQuery);
  const count = Number(body.count);
  const budgetUsd = Number(body.budgetUsd);
  if (!buyerSegment || !locationQuery)
    throw new ApiError(
      400,
      "INVALID_SEARCH",
      "Informe o segmento comprador e a região.",
    );
  if (!Number.isInteger(count) || count < 1 || count > 20)
    throw new ApiError(
      400,
      "INVALID_COUNT",
      "Quantidade deve ser um inteiro entre 1 e 20.",
    );
  if (!Number.isFinite(budgetUsd) || budgetUsd < 0.01 || budgetUsd > maxBudget)
    throw new ApiError(
      400,
      "INVALID_BUDGET",
      `Teto por coleta: USD ${maxBudget.toFixed(2)}. Informe um limite entre 0,01 e esse teto.`,
    );
  if (!/^[a-zA-Z0-9-]{16,80}$/.test(body.requestId || ""))
    throw new ApiError(
      400,
      "INVALID_REQUEST_ID",
      "Identificador idempotente obrigatório.",
    );
  return {
    product: text(body.product),
    buyerSegment,
    locationQuery: /^(brazil|brasil)$/i.test(locationQuery)
      ? "Brasil"
      : locationQuery,
    count,
    budgetUsd,
    requestId: body.requestId,
  };
}
export function realMapsUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  try {
    const u = new URL(value);
    const host = u.hostname.toLowerCase();
    const google =
      host === "google.com" ||
      host.endsWith(".google.com") ||
      host === "google.com.br" ||
      host.endsWith(".google.com.br");
    return u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      ((google && u.pathname.startsWith("/maps")) || host === "maps.app.goo.gl")
      ? u.href
      : "";
  } catch {
    return "";
  }
}
export function normalizePlaces(items: unknown, capturedAt: number) {
  if (!Array.isArray(items))
    throw new ApiError(502, "INVALID_DATASET", "Formato de dataset inválido.");
  const seen = new Set<string>();
  return items.slice(0, 20).flatMap((item) => {
    const name = text(item?.title || item?.name, 240);
    const sourceUrl = realMapsUrl(item?.url || item?.placeUrl);
    if (!name || !sourceUrl || seen.has(sourceUrl)) return [];
    seen.add(sourceUrl);
    const lead: any = {
      name,
      phone: text(item.phone || item.phoneUnformatted, 60),
      location: text(item.address, 500),
      profileUrl: sourceUrl,
      sourceUrl,
      sourceId: text(item.placeId, 200) || sourceUrl,
      capturedAt,
      platform: "google_maps",
      entityType: "pj",
      source: "Apify · Google Maps",
      category: text(item.categoryName, 200),
      status: "new",
      qualification: "Empresa compatível; intenção de compra não comprovada",
    };
    if (
      Number.isFinite(item.totalScore) &&
      item.totalScore >= 0 &&
      item.totalScore <= 5
    )
      lead.rating = item.totalScore;
    if (Number.isInteger(item.reviewsCount) && item.reviewsCount >= 0)
      lead.reviewsCount = item.reviewsCount;
    if (typeof item.website === "string" && /^https?:\/\//.test(item.website))
      lead.website = item.website;
    return [lead];
  });
}
export interface ApifyConfig {
  token?: string;
  maxRunUsd: number;
  dailyUsd: number;
}
export class ApifyService {
  constructor(
    private repo: Repository,
    readonly config: ApifyConfig,
    private transport: typeof fetch = fetch,
  ) {}
  private async request(path: string, method = "GET", body?: any) {
    if (!this.config.token)
      throw new ApiError(
        503,
        "APIFY_NOT_CONFIGURED",
        "Configure APIFY_TOKEN nos segredos do servidor. Nenhum lead foi gerado.",
      );
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    try {
      const res = await this.transport(`https://api.apify.com/v2/${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.config.token}`,
          "Content-Type": "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal,
      });
      if (!res.ok)
        throw new ApiError(
          502,
          `APIFY_HTTP_${res.status}`,
          `Apify retornou HTTP ${res.status}.`,
        );
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }
  async start(uid: string, body: any) {
    if (!this.config.token)
      throw new ApiError(
        503,
        "APIFY_NOT_CONFIGURED",
        "Configure APIFY_TOKEN nos segredos do servidor. Nenhum lead foi gerado.",
      );
    const input = searchInput(body, this.config.maxRunUsd);
    const fingerprint = JSON.stringify([
      input.product,
      input.buyerSegment,
      input.locationQuery,
      input.count,
      input.budgetUsd,
    ]);
    const reservation = await this.repo.transaction(uid, async (t) => {
      const existing = await t.get("apify_runs", input.requestId);
      if (existing) {
        if (existing.fingerprint !== fingerprint)
          throw new ApiError(
            409,
            "REQUEST_CONFLICT",
            "Este identificador já corresponde a outra consulta.",
          );
        return { row: existing, created: false };
      }
      const quota = await t.get("quotas", "apify");
      const today = new Date().toISOString().slice(0, 10);
      const active = Number(quota?.active || 0);
      const reserved = quota?.day === today ? Number(quota.reserved || 0) : 0;
      if (
        active >= 2 ||
        reserved + input.budgetUsd > this.config.dailyUsd + 1e-9
      )
        throw new ApiError(
          429,
          "APIFY_QUOTA",
          "Limite de duas coletas simultâneas ou orçamento diário atingido.",
        );
      const row: Row = {
        id: input.requestId,
        ...input,
        fingerprint,
        uid,
        status: "STARTING",
        slotReleased: false,
        createdAt: Date.now(),
        archived: false,
      };
      t.set("quotas", "apify", {
        active: active + 1,
        reserved: reserved + input.budgetUsd,
        day: today,
      });
      t.set("apify_runs", input.requestId, row);
      return { row, created: true };
    });
    if (!reservation.created) return reservation.row;
    let remote: any;
    try {
      const params = new URLSearchParams({
        timeout: "120",
        maxItems: String(input.count),
        maxTotalChargeUsd: String(input.budgetUsd),
      });
      remote = (
        await this.request(`actors/${ACTOR}/runs?${params}`, "POST", {
          searchStringsArray: [input.buyerSegment],
          locationQuery: input.locationQuery,
          maxCrawledPlacesPerSearch: input.count,
          language: "pt-BR",
        })
      ).data;
      if (
        !/^[\w-]+$/.test(remote?.id || "") ||
        !/^[\w-]+$/.test(remote?.defaultDatasetId || "")
      )
        throw new Error("Resposta de execução inválida.");
      return await this.transition(
        uid,
        input.requestId,
        remote.status || "RUNNING",
        { runId: remote.id, datasetId: remote.defaultDatasetId },
      );
    } catch (e) {
      // A timeout can occur AFTER a charged run has started. Keep its budget and slot reserved; never retry the POST automatically.
      if (remote?.id) {
        await this.request(`actor-runs/${remote.id}/abort`, "POST").catch(
          () => {},
        );
      }
      await this.transition(uid, input.requestId, "START_UNKNOWN").catch(
        () => {},
      );
      throw new ApiError(
        502,
        "START_UNCERTAIN",
        "Não foi possível confirmar o início. Orçamento reservado; não repita a coleta. Verifique a execução no Apify antes de reconciliar.",
      );
    }
  }
  private async transition(
    uid: string,
    id: string,
    status: string,
    extra: any = {},
  ) {
    return this.repo.transaction(uid, async (t) => {
      const row = await t.get("apify_runs", id);
      if (!row || row.uid !== uid)
        throw new ApiError(
          404,
          "RUN_NOT_FOUND",
          "Consulta não encontrada para este usuário.",
        );
      const quota = await t.get("quotas", "apify");
      // Terminal transitions and slot release are in the SAME transaction; concurrent status/abort calls cannot release twice.
      if (TERMINAL.has(row.status)) return row;
      const next = { ...row, ...extra, status, updatedAt: Date.now() };
      if (TERMINAL.has(status) && !row.slotReleased) {
        next.slotReleased = true;
        t.set("quotas", "apify", {
          ...quota,
          active: Math.max(0, Number(quota?.active || 0) - 1),
        });
      }
      t.set("apify_runs", id, next);
      return next;
    });
  }
  async status(uid: string, id: string) {
    const row = await this.repo.get(uid, "apify_runs", id);
    if (!row || row.uid !== uid)
      throw new ApiError(
        404,
        "RUN_NOT_FOUND",
        "Consulta não encontrada para este usuário.",
      );
    if (TERMINAL.has(row.status) || !row.runId) return row;
    const data = (await this.request(`actor-runs/${row.runId}`)).data;
    if (!data?.status)
      throw new ApiError(
        502,
        "INVALID_RUN",
        "Status inválido retornado pelo Apify.",
      );
    return this.transition(uid, id, data.status);
  }
  async dataset(uid: string, id: string) {
    const row = await this.status(uid, id);
    if (row.status !== "SUCCEEDED") return { ...row, leads: [] };
    if (Array.isArray(row.leads)) return row;
    const items = await this.request(
      `datasets/${row.datasetId}/items?clean=true&limit=${row.count}`,
    );
    const leads = normalizePlaces(items, Date.now()).slice(0, row.count);
    return this.repo.transaction(uid, async (t) => {
      const current = await t.get("apify_runs", id);
      if (!current)
        throw new ApiError(404, "RUN_NOT_FOUND", "Consulta não encontrada.");
      const next = { ...current, leads, capturedAt: Date.now() };
      t.set("apify_runs", id, next);
      return next;
    });
  }
  async abort(uid: string, id: string) {
    const row = await this.status(uid, id);
    if (TERMINAL.has(row.status) || !row.runId) return row;
    const data = (await this.request(`actor-runs/${row.runId}/abort`, "POST"))
      .data;
    if (!data?.status)
      throw new ApiError(
        502,
        "INVALID_ABORT",
        "Cancelamento ainda não confirmado.",
      );
    return this.transition(uid, id, data.status);
  }
}
