import test from "node:test";
import assert from "node:assert/strict";
import { startBuyerRadar } from "../src/server/buyerRadar.js";

test("free-only radar bypasses paid ledger and transport even when paid limits are enabled", async () => {
  let paidCalls = 0;
  const paid = async () => {
    paidCalls++;
    throw new Error("Unexpected paid call");
  };
  const result = await startBuyerRadar({ query: "iodo 10%", location: "Brasil" }, {
    freeOnly: true,
    apifyToken: "test-token",
    limits: { enabled: true, reserveUsd: 1 },
    store: { get: paid, reserve: paid },
    fetcher: paid,
    collectWorker: async () => ({ records: [], reports: [], pending: [] }),
  });
  assert.equal(result.done, true);
  assert.equal(paidCalls, 0);
});
