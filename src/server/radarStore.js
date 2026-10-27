import { createHash } from "node:crypto";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import config from "../../firebase-applet-config.json" with { type: "json" };
export const radarKey = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const memory = new Map();
export function memoryCacheGet(key, now = Date.now()) {
  const entry = memory.get(key);
  if (!entry || entry.expiresAt <= now) {
    memory.delete(key);
    return null;
  }
  return structuredClone(entry);
}
export function memoryCacheSet(key, value, ttl, now = Date.now()) {
  if (memory.size >= 100) memory.delete(memory.keys().next().value);
  memory.set(key, {
    ...structuredClone(value),
    collectedAt: now,
    expiresAt: now + ttl,
  });
}
export function reserveBudgetState(state, limits, key, now) {
  const active = (state.active || []).filter((x) => x.expiresAt > now);
  if (
    active.reduce((sum, x) => sum + (x.actors || 0), 0) + limits.maxActors >
    limits.actorConcurrent
  )
    throw Error("Limite global de Actors concorrentes atingido.");
  if (active.length >= limits.concurrent)
    throw Error("Limite global de execuções concorrentes atingido.");
  if ((state.reservedUsd || 0) + limits.reserveUsd > limits.dailyUsd)
    throw Error("Orçamento diário esgotado.");
  if ((state.serperQueries || 0) + limits.serperQueries > limits.dailyQueries)
    throw Error("Limite diário de consultas Serper atingido.");
  return {
    reservedUsd: (state.reservedUsd || 0) + limits.reserveUsd,
    serperQueries: (state.serperQueries || 0) + limits.serperQueries,
    active: [
      ...active,
      { key, expiresAt: now + 30 * 60 * 1000, actors: limits.maxActors },
    ],
  };
}
export function createRadarStore() {
  if (!process.env.BLITZ_FIREBASE_SERVICE_ACCOUNT) return null;
  const app =
    getApps().find((a) => a.name === "blitz-radar-store") ||
    initializeApp(
      {
        credential: cert(
          JSON.parse(process.env.BLITZ_FIREBASE_SERVICE_ACCOUNT),
        ),
        projectId: config.projectId,
      },
      "blitz-radar-store",
    );
  const db = getFirestore(app, config.firestoreDatabaseId || "(default)");
  const collection = db.collection("_blitzRadarExecutions");
  return {
    async get(key) {
      const s = await collection.doc(key).get();
      return s.exists ? s.data() : null;
    },
    async put(key, value) {
      await collection
        .doc(key)
        .set(JSON.parse(JSON.stringify(value)), { merge: true });
    },
    async reserve(key, limits, now = Date.now()) {
      // One global ledger covers all accounts and both Preview/Production using this database.
      const day = new Intl.DateTimeFormat("en-CA", {
          timeZone: "America/Sao_Paulo",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date(now)),
        ledger = db.collection("_blitzRadarBudget").doc(day),
        execution = collection.doc(key),
        activeRef = db.collection("_blitzRadarBudget").doc("_active");
      return db.runTransaction(async (tx) => {
        const [previous, snapshot, activeSnapshot] = await Promise.all([
          tx.get(execution),
          tx.get(ledger),
          tx.get(activeRef),
        ]);
        const p = previous.data();
        if (p && p.expiresAt > now) return { duplicate: true, execution: p };
        const state = {
          ...(snapshot.data() || {
            reservedUsd: 0,
            serperQueries: 0,
            active: [],
          }),
          active: activeSnapshot.data()?.active || [],
        };
        const expiresAt = now + 30 * 60 * 1000;
        const next = reserveBudgetState(state, limits, key, now);
        tx.set(ledger, {
          reservedUsd: next.reservedUsd,
          serperQueries: next.serperQueries,
        });
        tx.set(activeRef, { active: next.active });
        tx.set(execution, {
          status: "starting",
          expiresAt,
          day,
          reservedUsd: limits.reserveUsd,
        });
        return { duplicate: false };
      });
    },
    async finish(key) {
      const e = await this.get(key);
      if (!e?.day) return;
      const ref = db.collection("_blitzRadarBudget").doc("_active");
      await db.runTransaction(async (tx) => {
        const s = await tx.get(ref);
        if (s.exists)
          tx.update(ref, {
            active: (s.data().active || []).filter((x) => x.key !== key),
          });
      });
    },
  };
}
export function paidLimits(env = process.env) {
  const positive = (key, max) => {
    const n = Number(env[key]);
    return Number.isFinite(n) && n > 0 ? Math.min(n, max) : 0;
  };
  const searchUsd = positive("BLITZ_RADAR_SEARCH_USD", 10),
    dailyUsd = positive("BLITZ_RADAR_DAILY_USD", 100),
    actorUsd = positive("BLITZ_APIFY_MAX_USD_PER_RUN", 2),
    serperUnitUsd = positive("BLITZ_SERPER_QUERY_USD", 1);
  const serperQueries = Math.floor(positive("BLITZ_RADAR_SERPER_QUERIES", 6)),
    maxActors = Math.floor(positive("BLITZ_RADAR_MAX_ACTORS", 5));
  const dailyQueries = Math.floor(
      positive("BLITZ_RADAR_DAILY_SERPER_QUERIES", 100),
    ),
    concurrent = Math.floor(positive("BLITZ_RADAR_CONCURRENCY", 3));
  const actorConcurrent = Math.floor(
    positive("BLITZ_RADAR_ACTOR_CONCURRENCY", 10),
  );
  const reserveUsd = Number(
    (maxActors * actorUsd + serperQueries * serperUnitUsd).toFixed(6),
  );
  return {
    searchUsd,
    dailyUsd,
    actorUsd,
    serperUnitUsd,
    serperQueries,
    maxActors,
    dailyQueries,
    concurrent,
    actorConcurrent,
    reserveUsd,
    enabled: !!(
      searchUsd &&
      dailyUsd &&
      actorUsd &&
      maxActors &&
      concurrent &&
      actorConcurrent >= maxActors &&
      reserveUsd <= searchUsd &&
      (!serperQueries || (serperUnitUsd && dailyQueries))
    ),
  };
}
