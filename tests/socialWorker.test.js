import test from 'node:test';import assert from 'node:assert/strict';
import {startSocialRadar} from '../src/server/socialRadar.js';
import {collectSocialWorker} from '../src/server/socialWorker.js';
import {startBuyerRadar} from '../src/server/buyerRadar.js';
import {classifyRecords,sourceReport} from '../src/server/radarReport.js';
const url='https://www.instagram.com/p/PUBLIC/';
const record={platform:'instagram',collectionUrl:url,sourceUrl:url,authorUrl:'https://www.instagram.com/buyer/',name:'buyer',text:'Quero comprar tinta. Moro em Paracatu MG',publishedAt:'2026-10-14',retrievedAt:'2026-10-14T10:00:00Z',collector:'Playwright — DOM público visível'};
test('unconfigured worker is explicit and makes no outgoing call',async()=>{const result=await collectSocialWorker({}, {workerUrl:'',workerToken:'',workerFetcher:()=>assert.fail('must not call')});assert.match(result.reports[0].limits[0],/worker não configurado/);});
test('worker connection uses server token, stops redirects and removes cross-platform evidence',async()=>{
 const result=await collectSocialWorker({query:'tinta',location:'Paracatu MG',sourceUrls:[url]},{workerUrl:'https://worker.example.test',workerToken:'fixture',workerFetcher:async(u,options)=>{assert.equal(u.href,'https://worker.example.test/collect');assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Bearer fixture');assert.equal(JSON.parse(options.body).maxRecords,100);return {ok:true,json:async()=>({records:[record,{...record,authorUrl:'https://www.tiktok.com/@buyer'}],reports:[]})};}});assert.equal(result.records.length,1);
 await assert.rejects(collectSocialWorker({}, {workerUrl:'http://localhost:8080',workerToken:'fixture'}),/HTTPS/);
});
test('worker precedes paid sources, classifies sellers/region and preserves collection evidence',async()=>{
 const body={query:'tinta',location:'Paracatu MG',count:1,sourceUrls:[url]};
 const result=await startBuyerRadar(body,{userId:'worker-fixture',now:Date.parse('2026-10-14T12:00:00Z'),collectWorker:async()=>({records:[record,{...record,name:'seller',authorUrl:'https://www.instagram.com/seller/',text:'Vendo tinta'},{...record,name:'unknown',authorUrl:'https://www.instagram.com/unknown/',text:'Quero comprar tinta'}],reports:[{source:'Worker instagram',platform:'instagram',url,consulted:true,status:'limited',received:3,pages:2,errors:[],limits:['Paginação limitada']}],pending:[]}),fetcher:()=>assert.fail('paid APIs not needed')});
 assert.equal(result.leads.length,1);assert.equal(result.regionalUnconfirmed.length,1);assert.equal(result.meta.executionReport.sources[0].discarded.vendedor,1);assert.equal(result.meta.executionReport.state,'partial'); // bounded DOM does not certify full coverage
 assert.equal(result.leads[0].evidence.intent.source,record.collector);assert.equal(result.leads[0].evidence.intent.retrievedAt,record.retrievedAt);assert.equal(result.leads[0].phone,'');
});
test('deduplication keeps separate platform identities and matches worker/paid IDs for same evidence',()=>{
 const report=sourceReport('fixture');const rows=[record,{...record,id:'different-provider-id'}];assert.equal(classifyRecords(rows,'instagram','tinta','Paracatu MG',report,{now:Date.parse('2026-10-14')}).leads.length,1);assert.equal(report.discarded.duplicidade,1);
});

test('sources discovered within reserved Serper budget are sent to free worker before any Actor',async()=>{
 let collected=false;const discovered='https://www.facebook.com/groups/public/';
 const result=await startSocialRadar({query:'tinta',location:'Paracatu MG',count:1,sourceUrls:[]},{apifyToken:'fixture',serperKey:'fixture',paidPermit:{actorUsd:.1,maxActors:1,serperQueries:1},collectDiscovered:async urls=>{assert.deepEqual(urls,[discovered]);collected=true;return true;},fetcher:async endpoint=>{assert.equal(endpoint,'https://google.serper.dev/search');return {ok:true,json:async()=>({organic:[{link:discovered}]})};}});
 assert.equal(result.done,true);assert.equal(collected,true);assert.equal(result.job,undefined);
});
