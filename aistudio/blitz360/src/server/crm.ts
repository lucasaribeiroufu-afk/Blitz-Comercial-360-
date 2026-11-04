import { createHash, randomUUID } from "node:crypto";
import type { Repository, Row } from "./repository";
import { ApiError, TERMINAL, text } from "./apify";

export const STAGES = [
  "new",
  "contacted",
  "meeting",
  "qualified",
  "won",
  "lost",
  "unreachable",
];
export function phoneKey(value: unknown) {
  let digits = text(value, 60).replace(/\D/g, "");
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55"))
    digits = digits.slice(2);
  return /^(?:[1-9]\d)[2-9]\d{7,8}$/.test(digits) ? digits : "";
}
export function cnpjKey(value: unknown) {
  const c = text(value, 40)
    .replace(/[^\da-z]/gi, "")
    .toUpperCase();
  return /^[A-Z\d]{12}\d{2}$/.test(c) ? c : "";
}
function key(kind: string, value: string) {
  return createHash("sha256").update(`${kind}:${value}`).digest("hex");
}
function keys(c: any) {
  return [
    cnpjKey(c.cnpj) && key("cnpj", cnpjKey(c.cnpj)),
    text(c.sourceUrl || c.profileUrl, 1500) &&
      key("source", text(c.sourceUrl || c.profileUrl, 1500)),
    phoneKey(c.phone) && key("phone", phoneKey(c.phone)),
  ].filter(Boolean) as string[];
}
function sameCompany(a: any, b: any) {
  const ac = cnpjKey(a.cnpj),
    bc = cnpjKey(b.cnpj);
  if (ac && bc) return ac === bc;
  const au = text(a.sourceUrl || a.profileUrl, 1500),
    bu = text(b.sourceUrl || b.profileUrl, 1500);
  if (
    au &&
    bu &&
    au !== bu &&
    text(a.name).toLowerCase() !== text(b.name).toLowerCase()
  )
    return false;
  return true;
}
function millis(value: any) {
  return typeof value?.toMillis === "function"
    ? value.toMillis()
    : typeof value === "number" && Number.isFinite(value)
      ? value
      : 0;
}
export function publicContact(row: Row) {
  // Do not synthesize ratings, demand, contacts, or provenance for legacy documents.
  return {
    ...row,
    createdAt: millis(row.createdAt),
    updatedAt: millis(row.updatedAt),
    status: STAGES.includes(row.status) ? row.status : "new",
    name: text(row.name, 240),
    phone: text(row.phone, 60),
    location: text(row.location, 500),
    legacy: !row.sourceUrl && row.origin !== "manual",
  };
}
export class CrmService {
  constructor(private repo: Repository) {}
  async contacts(uid: string) {
    return (await this.repo.list(uid, "contacts"))
      .filter((r) => r.archived !== true)
      .map(publicContact)
      .sort((a, b) => b.createdAt - a.createdAt);
  }
  async save(uid: string, body: any) {
    let c: any;
    if (body.requestId && body.sourceId) {
      const run = await this.repo.get(
        uid,
        "apify_runs",
        text(body.requestId, 80),
      );
      c = run?.leads?.find((l: any) => l.sourceId === body.sourceId);
      if (!c || run?.uid !== uid)
        throw new ApiError(
          400,
          "LEAD_NOT_COLLECTED",
          "Lead não pertence a uma coleta salva desta conta.",
        );
      c = { ...c, origin: "apify", productContext: run.product };
    } else {
      const manual = body.manual || {};
      if (!text(manual.name, 240))
        throw new ApiError(400, "NAME_REQUIRED", "Informe o nome do contato.");
      c = {
        name: text(manual.name, 240),
        phone: text(manual.phone, 60),
        email: text(manual.email, 200),
        location: text(manual.location, 500),
        cnpj: text(manual.cnpj, 40),
        notes: text(manual.notes, 4000),
        origin: "manual",
        platform: "other",
        profileUrl: "",
        status: "new",
      };
    }
    const aliases = keys(c);
    // Legacy contacts do not have aliases or an archived field. Scan only this UID once per save and check normalized values.
    const legacy = await this.repo.list(uid, "contacts");
    const candidate = legacy.find((r) =>
      keys(r).some((k) => aliases.includes(k)),
    );
    const id = randomUUID();
    return this.repo.transaction(uid, async (t) => {
      const refs = await Promise.all(
        aliases.map((k) => t.get("contact_keys", k)),
      );
      const ids = [
        ...new Set(
          [candidate?.id, ...refs.map((r) => r?.contactId)].filter(Boolean),
        ),
      ] as string[];
      if (ids.length > 1)
        throw new ApiError(
          409,
          "DUPLICATE_REVIEW_REQUIRED",
          "Há cadastros conflitantes. Revise os contatos antes de unir dados.",
        );
      const existing = ids[0] ? await t.get("contacts", ids[0]) : null;
      if (existing && !sameCompany(existing, c))
        throw new ApiError(
          409,
          "SHARED_PHONE_REVIEW",
          "Telefone compartilhado por empresas diferentes. Revise o cadastro; os dados não foram mesclados.",
        );
      const targetId = existing?.id || id;
      if (existing) {
        // Recollecting must NEVER reset the sales stage, notes, follow-up or interaction history, or reactivate an archive.
        const refresh: any = { ...existing, updatedAt: Date.now() };
        for (const f of [
          "sourceUrl",
          "profileUrl",
          "capturedAt",
          "sourceId",
          "rating",
          "reviewsCount",
          "category",
          "source",
        ])
          if (c[f] !== undefined) refresh[f] = c[f];
        t.set("contacts", targetId, refresh);
      } else {
        t.set("contacts", targetId, {
          ...c,
          id: targetId,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          status: "new",
          archived: false,
        });
      }
      aliases.forEach((k) => t.set("contact_keys", k, { contactId: targetId }));
      return {
        id: targetId,
        duplicate: !!existing,
        archived: existing?.archived === true,
      };
    });
  }
  async update(uid: string, id: string, body: any) {
    const patch: any = {};
    for (const f of ["notes", "nextAction", "nextActionDate"])
      if (f in body) patch[f] = text(body[f], f === "notes" ? 4000 : 200);
    if ("status" in body) {
      if (!STAGES.includes(body.status))
        throw new ApiError(400, "INVALID_STAGE", "Etapa inválida.");
      patch.status = body.status;
    }
    if ("estimatedValue" in body) {
      const value = Number(body.estimatedValue);
      if (!Number.isFinite(value) || value < 0)
        throw new ApiError(400, "INVALID_VALUE", "Valor estimado inválido.");
      patch.estimatedValue = value;
    }
    if (
      patch.nextActionDate &&
      !Number.isFinite(Date.parse(patch.nextActionDate))
    )
      throw new ApiError(400, "INVALID_DATE", "Data de retorno inválida.");
    const interactionId = randomUUID();
    return this.repo.transaction(uid, async (t) => {
      const row = await t.get("contacts", id);
      if (!row)
        throw new ApiError(404, "CONTACT_NOT_FOUND", "Contato não encontrado.");
      const next = { ...row, ...patch, updatedAt: Date.now() };
      t.set("contacts", id, next);
      if (patch.status && patch.status !== row.status)
        t.set("interactions", interactionId, {
          contactId: id,
          type: "stage",
          notes: `Etapa: ${row.status || "new"} → ${patch.status}`,
          createdAt: Date.now(),
        });
      return publicContact(next);
    });
  }
  async interact(uid: string, id: string, body: any) {
    if (
      !["whatsapp", "call", "email", "meeting", "note"].includes(body.type) ||
      !text(body.notes, 4000)
    )
      throw new ApiError(
        400,
        "INVALID_INTERACTION",
        "Informe canal e resumo da abordagem realizada.",
      );
    const interactionId = randomUUID();
    await this.repo.transaction(uid, async (t) => {
      const row = await t.get("contacts", id);
      if (!row)
        throw new ApiError(404, "CONTACT_NOT_FOUND", "Contato não encontrado.");
      t.set("interactions", interactionId, {
        contactId: id,
        type: body.type,
        notes: text(body.notes, 4000),
        createdAt: Date.now(),
      });
      t.set("contacts", id, {
        ...row,
        status:
          row.status === "new" && body.type !== "note"
            ? "contacted"
            : row.status || "new",
        updatedAt: Date.now(),
      });
    });
  }
  async history(uid: string, id: string) {
    return (await this.repo.list(uid, "interactions"))
      .filter((r) => r.contactId === id)
      .sort((a, b) => b.createdAt - a.createdAt);
  }
  async inventory(uid: string) {
    const [contacts, runs, batches] = await Promise.all(
      ["contacts", "apify_runs", "cleanup_batches"].map((c) =>
        this.repo.list(uid, c),
      ),
    );
    return {
      contacts: contacts.filter((r) => r.archived !== true).length,
      archivedContacts: contacts.filter((r) => r.archived === true).length,
      searches: runs.filter((r) => r.archived !== true).length,
      running: runs.filter((r) => !TERMINAL.has(r.status)).length,
      lastBatch:
        batches
          .filter((r) => r.state !== "RESTORED")
          .sort((a, b) => b.createdAt - a.createdAt)[0] || null,
    };
  }
  async archive(uid: string, batchId?: string) {
    let manifest = batchId
      ? await this.repo.get(uid, "cleanup_batches", batchId)
      : null;
    if (batchId && !manifest)
      throw new ApiError(
        404,
        "BATCH_NOT_FOUND",
        "Lote não encontrado para este usuário.",
      );
    if (!manifest) {
      const [contacts, runs] = await Promise.all(
        ["contacts", "apify_runs"].map((c) => this.repo.list(uid, c)),
      );
      const targets = [
        ...contacts
          .filter((r) => r.archived !== true)
          .map((r) => ({ collection: "contacts", id: r.id })),
        ...runs
          .filter((r) => r.archived !== true && TERMINAL.has(r.status))
          .map((r) => ({ collection: "apify_runs", id: r.id })),
      ];
      const proposed: Row = {
        id: randomUUID(),
        targets,
        position: 0,
        changedContacts: 0,
        changedSearches: 0,
        state: "ARCHIVING",
        createdAt: Date.now(),
        skippedRunning: runs.filter((r) => !TERMINAL.has(r.status)).length,
      };
      manifest = await this.repo.transaction(uid, async (t) => {
        const control = await t.get("cleanup_control", "current");
        const previous = control?.batchId
          ? await t.get("cleanup_batches", control.batchId)
          : null;
        if (previous?.state === "RESTORING")
          throw new ApiError(
            409,
            "BATCH_BUSY",
            "Conclua a restauração em andamento antes de limpar novamente.",
          );
        if (previous?.state === "ARCHIVING") return previous;
        t.set("cleanup_batches", proposed.id, proposed);
        t.set("cleanup_control", "current", { batchId: proposed.id });
        return proposed;
      });
    }
    if (manifest.state === "RESTORED")
      throw new ApiError(409, "BATCH_RESTORED", "Este lote já foi restaurado.");
    if (manifest.state === "RESTORING")
      throw new ApiError(409, "BATCH_BUSY", "Este lote está sendo restaurado.");
    while (manifest.position < manifest.targets.length) {
      const id = manifest.id;
      manifest = await this.repo.transaction(uid, async (t) => {
        const current = (await t.get("cleanup_batches", id))!;
        if (current.state === "ARCHIVED") return current;
        if (current.state !== "ARCHIVING")
          throw new ApiError(
            409,
            "BATCH_BUSY",
            "O estado deste lote mudou. Atualize o diagnóstico.",
          );
        const chunk = current.targets.slice(
          current.position,
          current.position + 100,
        );
        const docs = await Promise.all(
          chunk.map((x: any) => t.get(x.collection, x.id)),
        );
        let cc = 0,
          cs = 0;
        docs.forEach((d, i) => {
          if (!d || d.archived === true) return;
          const target = chunk[i];
          t.set(target.collection, target.id, {
            ...d,
            archived: true,
            archivedAt: Date.now(),
            archiveBatchId: id,
          });
          if (target.collection === "contacts") cc++;
          else cs++;
        });
        const next = {
          ...current,
          position: current.position + chunk.length,
          changedContacts: current.changedContacts + cc,
          changedSearches: current.changedSearches + cs,
        };
        t.set("cleanup_batches", id, next);
        return next;
      });
    }
    await this.repo.transaction(uid, async (t) => {
      const current = (await t.get("cleanup_batches", manifest!.id))!;
      if (current.state === "ARCHIVING")
        t.set("cleanup_batches", current.id, { ...current, state: "ARCHIVED" });
    });
    return {
      batchId: manifest.id,
      contacts: manifest.changedContacts,
      searches: manifest.changedSearches,
      skippedRunning: manifest.skippedRunning,
    };
  }
  async restore(uid: string, requestedId?: string) {
    const manifest = requestedId
      ? await this.repo.get(uid, "cleanup_batches", requestedId)
      : (await this.inventory(uid)).lastBatch;
    if (!manifest)
      throw new ApiError(
        404,
        "BATCH_NOT_FOUND",
        "Nenhum lote disponível para restauração.",
      );
    if (manifest.state === "RESTORED")
      return { batchId: manifest.id, restored: 0 };
    await this.repo.transaction(uid, async (t) => {
      const current = (await t.get("cleanup_batches", manifest.id))!;
      if (current.state === "ARCHIVING")
        throw new ApiError(
          409,
          "ARCHIVE_INCOMPLETE",
          "Retome a limpeza interrompida antes de restaurar este lote.",
        );
      if (current.state !== "RESTORED")
        t.set("cleanup_batches", current.id, {
          ...current,
          state: "RESTORING",
        });
    });
    // Restore can resume after a network failure, and only touches records that STILL belong to this batch.
    let restored = 0;
    for (let start = 0; start < manifest.targets.length; start += 100) {
      const chunk = manifest.targets.slice(start, start + 100);
      restored += await this.repo.transaction(uid, async (t) => {
        const docs = await Promise.all(
          chunk.map((x: any) => t.get(x.collection, x.id)),
        );
        let count = 0;
        docs.forEach((d, i) => {
          if (!d || d.archiveBatchId !== manifest.id || d.archived !== true)
            return;
          t.set(chunk[i].collection, d.id, {
            ...d,
            archived: false,
            archivedAt: null,
            archiveBatchId: null,
          });
          count++;
        });
        return count;
      });
    }
    await this.repo.transaction(uid, async (t) => {
      const m = (await t.get("cleanup_batches", manifest.id))!;
      t.set("cleanup_batches", manifest.id, {
        ...m,
        state: "RESTORED",
        restoredAt: Date.now(),
      });
    });
    return { batchId: manifest.id, restored };
  }
}
