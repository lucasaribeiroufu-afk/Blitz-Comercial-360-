import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import config from "../../firebase-applet-config.json";

export type Row = Record<string, any> & { id: string };
export interface Tx {
  get(collection: string, id: string): Promise<Row | null>;
  set(collection: string, id: string, data: Record<string, any>): void;
}
export interface Repository {
  get(uid: string, collection: string, id: string): Promise<Row | null>;
  list(uid: string, collection: string): Promise<Row[]>;
  transaction<T>(uid: string, work: (tx: Tx) => Promise<T>): Promise<T>;
}
function admin() {
  const app =
    getApps().find((a) => a.name === "blitz-server") ||
    initializeApp({ projectId: config.projectId }, "blitz-server");
  return {
    auth: getAuth(app),
    db: getFirestore(app, config.firestoreDatabaseId || "(default)"),
  };
}
function segment(value: string) {
  if (!value || value.includes("/") || value.length > 160)
    throw new Error("Identificador inválido.");
  return value;
}
export function documentPath(uid: string, collection: string, id: string) {
  // Operational state lives OUTSIDE legacy client-writable user collections.
  // This remains protected even before the new rules file is deployed.
  const root = collection === "contacts" ? "users" : "blitz_server_v2_users";
  return `${root}/${segment(uid)}/${segment(collection)}/${segment(id)}`;
}
export async function verifyIdToken(token: string): Promise<string> {
  return (await admin().auth.verifyIdToken(token)).uid;
}
export class FirestoreRepository implements Repository {
  async get(uid: string, collection: string, id: string) {
    const d = await admin()
      .db.doc(documentPath(uid, collection, id))
      .get();
    return d.exists ? ({ ...d.data(), id: d.id } as Row) : null;
  }
  async list(uid: string, collection: string) {
    const root = collection === "contacts" ? "users" : "blitz_server_v2_users";
    const snap = await admin()
      .db.collection(`${root}/${segment(uid)}/${segment(collection)}`)
      .limit(6001)
      .get();
    if (snap.size > 6000)
      throw new Error(
        "Base acima de 6.000 registros. A operação requer paginação administrativa. Nenhum dado foi excluído.",
      );
    return snap.docs.map((d) => ({ ...d.data(), id: d.id }) as Row);
  }
  async transaction<T>(uid: string, work: (tx: Tx) => Promise<T>) {
    const db = admin().db;
    return db.runTransaction(async (t) =>
      work({
        get: async (collection, id) => {
          const d = await t.get(db.doc(documentPath(uid, collection, id)));
          return d.exists ? ({ ...d.data(), id: d.id } as Row) : null;
        },
        set: (collection, id, data) => {
          const { id: ignored, ...rest } = data;
          t.set(db.doc(documentPath(uid, collection, id)), rest);
        },
      }),
    );
  }
}
