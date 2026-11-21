import {rawRead} from './http.js';
import {identity} from './extract.js';
import {normalize} from '../src/server/verifiedSearch.js';
import {setTimeout as sleep} from 'node:timers/promises';

const day = date => new Intl.DateTimeFormat('sv-SE', {timeZone:'America/Sao_Paulo'}).format(date).replaceAll('-', '');
const dateValue = value => Date.parse(/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?$/.test(value || '') ? value + '-03:00' : value);
const words = text => normalize(text).split(' ').filter(word => word.length > 2 && !['para','com','dos','das'].includes(word));
export function matchesProduct(text, query) {
  const tokens = new Set(words(text));
  return words(query).every(word => tokens.has(word) || tokens.has(word + 's') ||
    (word.endsWith('s') && tokens.has(word.slice(0, -1))));
}

export async function procurement(options, {read = rawRead, now = Date.now(), delayMs = 1000} = {}) {
  const records = [], reports = [], seen = new Set();
  let requests = 0;
  const deadline = Date.now() + 120000;
  const parts = options.location.split(/[,\-]/).map(part => part.trim()).filter(Boolean);
  const national = normalize(options.location) === 'brasil';
  const uf = parts.at(-1)?.toUpperCase();
  if (!national && !(parts.length === 2 && /^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/.test(uf)))
    throw Error('Para PNCP use Brasil ou Cidade, UF.');
  async function get(path) {
    if (requests >= 40 || Date.now() >= deadline) throw Error('Limite de 40 requisições ou 120 segundos PNCP atingido.');
    if (requests++) await sleep(delayMs);
    const response = await read('https://pncp.gov.br' + path);
    if (response.status === 204) return {data:[], totalPaginas:0};
    if (response.status !== 200) throw Error(`PNCP HTTP ${response.status}`);
    return JSON.parse(response.body);
  }
  for (const modality of [6,8,9]) {
    let exhausted = false;
    for (let page = 1; page <= options.pncpPages; page++) {
      const params = new URLSearchParams({dataFinal:day(new Date(now + 30 * 86400000)),
        codigoModalidadeContratacao:String(modality), pagina:String(page), tamanhoPagina:'50'});
      if (!national) params.set('uf', uf);
      const report = {source:'PNCP', modality, page, status:'collected', received:0};
      try {
        const response = await get('/api/consulta/v1/contratacoes/proposta?' + params);
        const notices = response.data;
        if (!Array.isArray(notices)) throw Error('Formato inesperado PNCP.');
        report.received = notices.length;
        for (const notice of notices) {
          const match = /^(\d{14})-1-(\d+)\/(\d{4})$/.exec(notice.numeroControlePNCP || '');
          const published = dateValue(notice.dataPublicacaoPncp);
          const deadline = dateValue(notice.dataEncerramentoProposta);
          const opening = dateValue(notice.dataAberturaProposta);
          if (!match || seen.has(match[0]) || !notice.orgaoEntidade?.razaoSocial ||
              !Number.isFinite(published) || published > now || !(opening <= now && deadline > now) ||
              (!national && (normalize(notice.unidadeOrgao?.municipioNome) !== normalize(parts[0]) || notice.unidadeOrgao?.ufSigla !== uf))) continue;
          seen.add(match[0]);
          // Fetch item text even when the generic procurement title omits the product.
          let itemEnd = false;
          for (let itemPage = 1; itemPage <= 3; itemPage++) {
            const path = `/api/pncp/v1/orgaos/${match[1]}/compras/${match[3]}/${Number(match[2])}`;
            const payload = await get(path + `/itens?pagina=${itemPage}&tamanhoPagina=50`);
            const items = Array.isArray(payload) ? payload : payload.data;
            if (!Array.isArray(items)) throw Error('Itens PNCP em formato inesperado.');
            for (const item of items.filter(item => matchesProduct(item.descricao || '', options.query))) {
              const intent = String(item.descricao);
              const sourceUrl = `https://pncp.gov.br/app/editais/${match[1]}/${match[3]}/${Number(match[2])}`;
              records.push({key:identity(`${match[0]}:${item.numeroItem}`), recordType:'purchase_mention',
                name:notice.orgaoEntidade.razaoSocial, cnpj:match[1], profileUrl:sourceUrl,
                location:[notice.unidadeOrgao?.municipioNome, notice.unidadeOrgao?.ufSigla].filter(Boolean).join(' - '),
                intent, matchedProduct:options.query, publishedAt:new Date(published).toISOString(),
                proposalDeadline:new Date(deadline).toISOString(), proposalChannel:notice.linkSistemaOrigem || '',
                quantity:item.quantidade, unit:item.unidadeMedida, platform:'website',
                verificationStatus:'source_observed', evidence:{intent:{value:intent, excerpt:intent,
                  source:'PNCP · item de contratação com prazo aberto', sourceUrl, retrievedAt:new Date(now).toISOString()}}});
            }
            if (items.length < 50) {itemEnd = true; break;}
          }
          if (!itemEnd) report.itemsLimited = true;
        }
        exhausted = notices.length < 50 || Number(response.totalPaginas) <= page;
      } catch (error) {report.status = 'failed'; report.reason = error.message;}
      reports.push(report);
      if (exhausted || report.status === 'failed') break;
    }
    if (!exhausted) reports.push({source:'PNCP', modality, status:'limited', reason:'Amostra atingiu limite de páginas ou houve falha.'});
  }
  return {records, reports};
}
