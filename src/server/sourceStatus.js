import { paidLimits } from "./radarStore.js";
export function sourceStatus() {
  return {
    socialWorker: !!(process.env.SOCIAL_WORKER_URL && process.env.SOCIAL_WORKER_TOKEN),
    socialWorkerStatus: process.env.SOCIAL_WORKER_URL && process.env.SOCIAL_WORKER_TOKEN ? "configurado; acesso não verificado" : "worker não configurado",
    publicHttpConfigured: !!process.env.BLITZ_PUBLIC_ALLOWED_HOSTS,
    paidBudgetConfigured: paidLimits().enabled,
    persistentBudgetConfigured: !!process.env.BLITZ_FIREBASE_SERVICE_ACCOUNT,
    googlePlaces: !!(
      process.env.GOOGLE_MAPS_API_KEY || process.env.CHAVE_API_DO_GOOGLE_MAPS
    ),
    serper: !!process.env.SERPER_API_KEY,
    apify: !!process.env.APIFY_API_TOKEN,
    casaDosDados: !!process.env.CASA_DOS_DADOS_API_KEY,
    brasilApi: true,
    note: "Presença de configuração; não comprova validade da chave, saldo ou permissão.",
  };
}
