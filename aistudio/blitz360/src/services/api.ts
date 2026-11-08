import { auth } from "../lib/firebase";
export async function api<T = any>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error("Entre com o Google para continuar.");
  const token = await user.getIdToken();
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
  const data = await res
    .json()
    .catch(() => ({ error: "O servidor não retornou JSON." }));
  if (!res.ok) throw new Error(data.error || `Erro HTTP ${res.status}`);
  return data;
}
export const send = (method: string, data: any) => ({
  method,
  body: JSON.stringify(data),
});
export const legacyStorageKeys = [
  "blitz360_api_config",
  "blitz360_search_history",
  "blitz360_results",
  "blitz360_last_search",
  "blitz360_search_cache",
];
export function clearLegacyCache() {
  for (const key of legacyStorageKeys) {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  }
}
