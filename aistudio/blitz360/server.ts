import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";
import {
  FirestoreRepository,
  verifyIdToken,
  type Repository,
} from "./src/server/repository";
import { ApiError, ApifyService, text } from "./src/server/apify";
import { collectDemand } from "./src/server/demand";
import { CrmService } from "./src/server/crm";

export interface ApiDependencies {
  repo?: Repository;
  verify?: (token: string) => Promise<string>;
  apify?: ApifyService;
  demandTransport?: typeof fetch;
}
function bounded(value: string | undefined, fallback: number, max: number) {
  const n = value === undefined ? fallback : Number(value);
  return Number.isFinite(n) && n >= 0.01 && n <= max ? n : fallback;
}
export function createApi(deps: ApiDependencies = {}) {
  const repo = deps.repo || new FirestoreRepository();
  const verify = deps.verify || verifyIdToken;
  const apify =
    deps.apify ||
    new ApifyService(repo, {
      token: process.env.APIFY_TOKEN?.trim() || process.env.APIFY_API_TOKEN?.trim(),
      maxRunUsd: bounded(process.env.APIFY_MAX_RUN_USD, 0.5, 2),
      dailyUsd: bounded(process.env.APIFY_DAILY_BUDGET_USD, 5, 20),
    });
  const crm = new CrmService(repo);
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "40kb" }));
  app.get("/api/health", (_req, res) =>
    res.json({ ok: true, service: "blitz360", version: "2.0.0" }),
  );
  const windows = new Map<string, { count: number; expires: number }>();
  app.use("/api", async (req: any, res, next) => {
    const match = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization || "");
    if (!match)
      return res
        .status(401)
        .json({
          code: "UNAUTHORIZED",
          error: "Entre com o Google para continuar.",
          leads: [],
        });
    try {
      req.uid = await verify(match[1]);
      if (!req.uid || req.uid.includes("/") || req.uid.length > 128)
        throw new Error();
    } catch {
      return res
        .status(401)
        .json({
          code: "UNAUTHORIZED",
          error: "Sessão inválida ou expirada.",
          leads: [],
        });
    }
    const now = Date.now();
    for (const [k, w] of windows) if (w.expires <= now) windows.delete(k);
    const w = windows.get(req.uid) || { count: 0, expires: now + 60000 };
    if (++w.count > 100) {
      res.setHeader("Retry-After", "60");
      return res
        .status(429)
        .json({
          code: "RATE_LIMIT",
          error: "Limite de chamadas por minuto atingido.",
        });
    }
    windows.set(req.uid, w);
    next();
  });
  const route =
    (work: (req: any, res: express.Response) => Promise<any>) =>
    (req: any, res: express.Response, next: express.NextFunction) =>
      Promise.resolve(work(req, res)).catch(next);
  app.get(
    "/api/config",
    route(async (_req, res) =>
      res.json({
        apifyConfigured: !!apify.config.token,
        maxRunUsd: apify.config.maxRunUsd,
        dailyUsd: apify.config.dailyUsd,
        sources: [
          {
            id: "google_maps",
            name: "Google Maps via Apify",
            enabled: !!apify.config.token,
          },
          {
            id: "social",
            name: "Redes sociais: conector não configurado",
            enabled: false,
          },
          {
            id: "pncp",
            name: "PNCP: conector não configurado",
            enabled: false,
          },
        ],
      }),
    ),
  );
  app.post(
    "/api/demand",
    route(async (req, res) => res.json(await collectDemand(
      repo, req.uid, req.headers.authorization, req.body ?? {}, deps.demandTransport,
    ))),
  );
  app.post(
    "/api/searches",
    route(async (req, res) =>
      res.status(202).json(await apify.start(req.uid, req.body)),
    ),
  );
  app.get(
    "/api/searches",
    route(async (req, res) =>
      res.json(
        (await repo.list(req.uid, "apify_runs"))
          .filter((r) => r.archived !== true)
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, 100),
      ),
    ),
  );
  app.get(
    "/api/searches/:id",
    route(async (req, res) =>
      res.json(await apify.status(req.uid, req.params.id)),
    ),
  );
  app.get(
    "/api/searches/:id/results",
    route(async (req, res) =>
      res.json(await apify.dataset(req.uid, req.params.id)),
    ),
  );
  app.post(
    "/api/searches/:id/cancel",
    route(async (req, res) =>
      res.json(await apify.abort(req.uid, req.params.id)),
    ),
  );
  app.get(
    "/api/contacts",
    route(async (req, res) => res.json(await crm.contacts(req.uid))),
  );
  app.post(
    "/api/contacts",
    route(async (req, res) => res.json(await crm.save(req.uid, req.body))),
  );
  app.patch(
    "/api/contacts/:id",
    route(async (req, res) =>
      res.json(await crm.update(req.uid, req.params.id, req.body)),
    ),
  );
  app.get(
    "/api/contacts/:id/interactions",
    route(async (req, res) =>
      res.json(await crm.history(req.uid, req.params.id)),
    ),
  );
  app.post(
    "/api/contacts/:id/interactions",
    route(async (req, res) => {
      await crm.interact(req.uid, req.params.id, req.body);
      res.json({ ok: true });
    }),
  );
  app.get(
    "/api/cleanup",
    route(async (req, res) => res.json(await crm.inventory(req.uid))),
  );
  app.post(
    "/api/cleanup/archive",
    route(async (req, res) =>
      res.json(
        await crm.archive(req.uid, text(req.body.batchId, 80) || undefined),
      ),
    ),
  );
  app.post(
    "/api/cleanup/restore",
    route(async (req, res) =>
      res.json(
        await crm.restore(req.uid, text(req.body.batchId, 80) || undefined),
      ),
    ),
  );
  // Legacy collectors are deliberately disabled. They cannot invoke their old synthetic fallbacks.
  app.use("/api", (_req, res) =>
    res
      .status(410)
      .json({
        code: "LEGACY_COLLECTOR_DISABLED",
        error: "Coletor antigo desativado. Utilize a busca Apify configurada.",
        leads: [],
      }),
  );
  app.use(
    (
      err: any,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (err instanceof ApiError)
        return res
          .status(err.status)
          .json({ code: err.code, error: err.message, leads: [] });
      if (err.type === "entity.too.large")
        return res
          .status(413)
          .json({
            code: "BODY_TOO_LARGE",
            error: "Requisição excede o limite.",
          });
      console.error("[API]", err?.code || err?.name || "error");
      res
        .status(503)
        .json({
          code: "SERVICE_UNAVAILABLE",
          error:
            "Serviço indisponível. Verifique a credencial de serviço do Firebase/Firestore e a conexão no servidor.",
          leads: [],
        });
    },
  );
  return app;
}
async function main() {
  const app = createApi();
  const root = path.dirname(fileURLToPath(import.meta.url));
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const publicDir = path.join(root, "public");
    app.use(express.static(publicDir));
    app.get("*", (_req, res) =>
      res.sendFile(path.join(publicDir, "index.html")),
    );
  }
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, "0.0.0.0", () =>
    console.log(`Blitz 360 iniciado na porta ${port}`),
  );
}
if (
  process.argv[1] &&
  ["server.ts", "server.js"].includes(path.basename(process.argv[1]))
)
  main().catch(() => {
    console.error("Falha ao iniciar o servidor Blitz 360.");
    process.exitCode = 1;
  });
