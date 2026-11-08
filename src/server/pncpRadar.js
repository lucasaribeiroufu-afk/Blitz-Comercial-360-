import { productQuery } from "./purchaseIntent.js";

const origin = "https://pncp.gov.br";
const fold = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const date = value => Date.parse(/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?$/.test(value || "") ? value + "-03:00" : value);
const stop = new Set(["para", "pelo", "pela", "com", "dos", "das", "uma", "comprar"]);
const words = value => fold(value).match(/[a-z0-9]+/g) || [];
const day = ms => new Intl.DateTimeFormat("sv-SE", {timeZone:"America/Sao_Paulo", year:"numeric", month:"2-digit", day:"2-digit"}).format(ms).replaceAll("-", "");

export async function collectPncp(body, { transport = fetch, now = Date.now() } = {}) {
  const terms = words(productQuery(body.query)).filter(word => word.length > 2 && !stop.has(word));
  if (!terms.length) return { leads: [], received: 0, failures: 0 };
  const signal = AbortSignal.timeout(6500);
  async function get(path) {
    const response = await transport(origin + path, { signal, redirect:"error", headers:{Accept:"application/json"} });
    if (response.status === 204) return [];
    if (!response.ok) throw new Error("PNCP indisponível");
    const payload = await response.json();
    const list = Array.isArray(payload) ? payload : payload?.data;
    if (!Array.isArray(list)) throw new Error("Resposta inesperada do PNCP");
    return list;
  }
  const region = fold(body.location);
  const uf = /-\s*([a-z]{2})$/.exec(region)?.[1];
  const city = uf ? region.replace(/\s*-\s*[a-z]{2}$/, "").trim() : "";
  const results = await Promise.allSettled([6,8,9].map(modality => {
    const params = new URLSearchParams({dataFinal:day(now + 30 * 86400000), codigoModalidadeContratacao:String(modality), pagina:"1", tamanhoPagina:"50"});
    if (uf) params.set("uf", uf.toUpperCase());
    return get("/api/consulta/v1/contratacoes/proposta?" + params);
  }));
  const notices = results.flatMap(result => result.status === "fulfilled" ? result.value : []);
  const seen = new Set();
  const candidates = notices.flatMap(notice => {
    const { orgaoEntidade: org, unidadeOrgao: unit } = notice;
    const id = /^(\d{14})-1-(\d+)\/(\d{4})$/.exec(notice.numeroControlePNCP || "");
    const deadline = date(notice.dataEncerramentoProposta);
    const opened = date(notice.dataAberturaProposta);
    const published = date(notice.dataPublicacaoPncp);
    if (!id || !org?.razaoSocial || !Number.isFinite(published) || published > now ||
        !(opened <= now && deadline > now) || (city && fold(unit?.municipioNome) !== city) ||
        (uf && fold(unit?.ufSigla) !== uf) || seen.has(id[0])) return [];
    const object = words(notice.objetoCompra);
    if (!terms.some(term => object.includes(term))) return [];
    seen.add(id[0]);
    return [{notice, id, deadline, published, org, unit}];
  }).slice(0, 8);
  const checked = await Promise.allSettled(candidates.map(async ({notice,id,deadline,published,org,unit}) => {
    const path = `/orgaos/${id[1]}/compras/${id[3]}/${Number(id[2])}`;
    const items = await get("/api/pncp/v1" + path + "/itens?pagina=1&tamanhoPagina=50");
    const item = items.find(row => {
      const tokens = words(row.descricao);
      return terms.every(term => tokens.includes(term) || tokens.includes(term + "s") ||
        (term.endsWith("s") && tokens.includes(term.slice(0,-1))));
    });
    if (!item) return null;
    const sourceUrl = `${origin}/app/editais/${id[1]}/${id[3]}/${Number(id[2])}`;
    const publishedAt = new Date(published).toISOString();
    const intent = String(item.descricao);
    return {name:org.razaoSocial, cnpj:id[1], location:[unit?.municipioNome,unit?.ufSigla].filter(Boolean).join(" - "),
      phone:"", email:"", profileUrl:sourceUrl, platform:"website", recordType:"purchase_mention",
      verificationStatus:"source_observed", intent, matchedProduct:body.query, publishedAt,
      demandTimeframe:`Propostas até ${notice.dataEncerramentoProposta} (horário de Brasília)`,
      proposalDeadline:new Date(deadline).toISOString(),
      evidence:{intent:{value:intent, excerpt:intent, source:"PNCP · item do edital", sourceUrl,
        retrievedAt:new Date(now).toISOString(), recordId:`${id[0]}:${item.numeroItem}`}}};
  }));
  return { leads:checked.flatMap(result => result.status === "fulfilled" && result.value ? [result.value] : []),
    received:notices.length, failures:[...results,...checked].filter(result => result.status === "rejected").length };
}
