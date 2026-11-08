import { createHash, randomUUID } from "node:crypto";
import { ApiError, text } from "./apify";
import type { Repository } from "./repository";

const radarEndpoint = "https://blitz-comercial-360.vercel.app/api/demand-radar";
const recentDays = 30;

export async function collectDemand(
  repo: Repository,
  uid: string,
  authorization: string,
  body: Record<string, unknown>,
  transport: typeof fetch = fetch,
) {
  const query = text(body.query, 300);
  const location = text(body.location, 160);
  const sourceUrls = body.sourceUrls ?? [];
  if (!query || !location || !Array.isArray(sourceUrls) || sourceUrls.length > 9 ||
      sourceUrls.some((url) => !publicHttps(url))) {
    throw new ApiError(400, "RADAR_INPUT", "Informe produto, região e até nove links HTTPS públicos.");
  }
  let response: Response;
  try {
    response = await transport(radarEndpoint, {
      method: "POST",
      headers: { Authorization: authorization, "Content-Type": "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(55000),
      body: JSON.stringify({ query, location, sourceUrls, count: 20 }),
    });
  } catch {
    throw new ApiError(502, "RADAR_CONNECTION", "O servidor do radar não respondeu. Tente novamente.");
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || !Array.isArray(payload.leads) || payload.done !== true) {
    const authError = response.status === 401 || response.status === 403;
    throw new ApiError(authError ? response.status : 502, "RADAR_UNAVAILABLE",
      authError ? "A conta precisa de acesso ao radar público." : "O radar público precisa estar implantado e acessível na Vercel.");
  }
  const cutoff = Date.now() - recentDays * 86400000;
  const leads = [];
  const seen = new Set<string>();
  for (const lead of payload.leads) {
    const evidence = lead?.evidence?.intent;
    const sourceUrl = publicHttps(evidence?.sourceUrl);
    const publishedAt = text(lead?.publishedAt, 60);
    const publicationTime = Date.parse(publishedAt);
    const name = text(lead?.name, 240);
    const excerpt = text(evidence?.excerpt, 1200);
    if (lead?.recordType !== "purchase_mention" || !sourceUrl || !name || !excerpt ||
        !Number.isFinite(publicationTime) || publicationTime < cutoff || publicationTime > Date.now()) continue;
    const sourceId = createHash("sha256").update(JSON.stringify([sourceUrl, name, excerpt])).digest("hex");
    if (seen.has(sourceId)) continue;
    seen.add(sourceId);
    leads.push({
      sourceId, sourceUrl, name, excerpt, publishedAt, capturedAt: Date.now(),
      location: text(lead.location, 500),
      phone: text(lead.evidence?.phone?.value, 60),
      email: text(lead.evidence?.email?.value, 200),
      platform: text(lead.platform, 40),
      productContext: query,
    });
    if (leads.length === 20) break;
  }
  const id = randomUUID();
  const run = { id, uid, query, location, leads, createdAt: Date.now(), status: "SUCCEEDED" };
  if (leads.length) await repo.transaction(uid, async (tx) => tx.set("demand_runs", id, run));
  const report = payload.meta?.executionReport;
  const summary = ["partial", "unavailable"].includes(report?.state)
    ? text(report.summary, 600)
    : "";
  return { id, leads, summary };
}

function publicHttps(value: unknown): string {
  if (typeof value !== "string" || value.length > 500) return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : "";
  } catch {
    return "";
  }
}
