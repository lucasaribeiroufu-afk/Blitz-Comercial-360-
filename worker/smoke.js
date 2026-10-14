import {collectBatch} from './collector.js';
const args=process.argv.slice(2);
if(!args.length){console.error('Uso: npm run smoke -- URL_PUBLICA [URL_PUBLICA...]');process.exit(2);}
const result=await collectBatch({query:'verificação de acesso público',location:'Brasil',sourceUrls:args,maxSources:args.length,maxPages:1,maxRecords:10});
console.log(JSON.stringify({testedAt:new Date().toISOString(),reports:result.reports,count:result.records.length,evidence:result.records.slice(0,3),pending:result.pending},null,2));
if(!result.records.length)process.exitCode=1;
