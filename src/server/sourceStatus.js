export function sourceStatus() {
 return {googlePlaces:!!(process.env.GOOGLE_MAPS_API_KEY||process.env.CHAVE_API_DO_GOOGLE_MAPS),serper:!!process.env.SERPER_API_KEY,apify:!!process.env.APIFY_API_TOKEN,casaDosDados:!!process.env.CASA_DOS_DADOS_API_KEY,brasilApi:true,
 note:'Presença de configuração; não comprova validade da chave, saldo ou permissão.'};
}
