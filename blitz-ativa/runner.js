import {crawl} from './crawler.js';
import {procurement} from './pncp.js';
import {discover} from './discovery.js';

export async function run(input, deps = {}) {
  const discovery = input.discover ? await (deps.discover || discover)(input,deps) : {sources:[],candidates:[],reports:[]};
  const sources = [...new Set([...input.sources,...discovery.sources])].slice(0,20);
  const web = sources.length ? await crawl({...input,sources}, deps) : {records:[], pages:[], limited:false};
  let official = {records:[], reports:[]};
  if (input.pncp && input.audience !== 'b2c') {
    try {official = await procurement(input, deps);} catch (error) {
      official.reports.push({source:'PNCP', status:'failed', reason:error.message});
    }
  }
  const allRecords = [...new Map([...web.records, ...official.records].map(record => [record.key, record])).values()];
  const records = allRecords.slice(0, 100);
  const reports = [...discovery.reports,...web.pages, ...official.reports];
  const collected = [...web.pages,...official.reports].some(report => report.status === 'collected');
  const partial = allRecords.length > records.length || web.limited || reports.some(report => ['failed','blocked','limited'].includes(report.status) || report.itemsLimited);
  return {records, documents:web.documents || [], report:{state:!collected ? 'unavailable' : partial ? 'partial' : 'complete',
    discovery,
    generatedAt:new Date().toISOString(), reports, pageLimitReached:web.limited,
    recordLimitReached:allRecords.length > records.length,
    purchaseMentions:records.filter(record => record.recordType === 'purchase_mention').length,
    corporateContacts:records.filter(record => record.recordType === 'potential_company').length,
    regionalUnconfirmed:records.filter(record => record.recordType === 'region_unconfirmed').length,
    paidProviderCalls:0,
    coverage:'Fontes descobertas e cadastradas, páginas públicas acessíveis e amostra PNCP. Intenção publicada exige revisão e não confirma compra atual.'}};
}
