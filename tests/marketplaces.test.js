import test from 'node:test';
import assert from 'node:assert/strict';
import {marketplacePlans,normalizeMarketplaceRows,marketplaceUrl} from '../src/server/marketplaces.js';
import {startSocialRadar,pollSocialRadar,issueJob} from '../src/server/socialRadar.js';
import {publishedBusinessContacts,enrichBusinessContacts} from '../src/server/businessContacts.js';
const mlUrl='https://produto.mercadolivre.com.br/MLB-123456-tinta-impermeabilizante';
const shopeeUrl='https://shopee.com.br/product/123/456';
test('marketplace input preserves known Actor schemas and avoids replacing anonymous buyers',async()=>{
 const r=await marketplacePlans({includeMarketplaces:true,query:'tinta impermeabilizante',count:5,sourceUrls:[mlUrl,shopeeUrl]});
 assert.equal(r.plans.length,2);assert.equal(r.plans[0].input.urls[0],shopeeUrl);assert.equal(r.plans[1].input.items[0],mlUrl);assert.ok(r.plans[1].input.maxQuestionsPerItem<=30);
 assert.equal((await marketplacePlans({includeMarketplaces:false,query:'tinta'})).plans.length,0);
 assert.equal(marketplaceUrl('https://shopee.com.br.evil.test/product/123/456','shopee'),'');
});
test('Mercado Livre answer date and seller text never become buyer contact or question date',()=>{
 const [r]=normalizeMarketplaceRows([{questionId:'fixture-question',itemId:'MLB123456',itemUrl:mlUrl,question:'Quero comprar tinta impermeabilizante, sou de Uberlândia-MG',answer:'Ligue para (34) 99999-1234, vendas@fixture.test',answerDate:'2026-10-12'}],'mercado_livre','tinta impermeabilizante','Uberlândia-MG');
 assert.equal(r.phone,'');assert.equal(r.email,'');assert.equal(r.buyerIdentityAvailable,false);assert.equal(r.name,'');assert.equal(r.questionDate,null);assert.equal(r.answerDate,'2026-10-12');assert.equal(r.regionalMatch,true);assert.equal(r.recordType,'marketplace_question');
 assert.equal(r.evidence.question.value,r.question);
});
test('Shopee seller shipping origin and sold count never become a regional buyer',()=>{
 const [r]=normalizeMarketplaceRows([{nome:'Tinta impermeabilizante fixture',preco:99.9,vendidos:150,vendidos_periodo:'total',cidade_envio:'Uberlândia-MG',url:shopeeUrl}],'shopee','tinta impermeabilizante','Uberlândia-MG');
 assert.equal(r.priceBRL,99.9);assert.equal(r.regionalMatch,null);assert.equal(r.buyerIdentityAvailable,false);assert.equal(r.classification,'product_catalog_and_historical_sales');assert.equal(r.phone,undefined);assert.equal(r.evidence.priceBRL.value,99.9);
 assert.equal(normalizeMarketplaceRows([{nome:'Tinta branca',url:shopeeUrl}],'shopee','tinta impermeabilizante','').length,0);
});
test('marketplace-only job is asynchronous and its signals never enter the contact list',async()=>{
 let count=0;
 const fetcher=async(url,opts)=>{
  if(url.includes('/acts/')&&!url.includes('/runs?'))return {ok:true,json:async()=>({data:{pricingInfos:[{pricingModel:'PAY_PER_EVENT'}]}})};
  if(url.includes('/runs?'))return {ok:true,json:async()=>({data:{id:`fixture-run-${++count}`}})};
  if(url.includes('/actor-runs/'))return {ok:true,json:async()=>({data:{status:'SUCCEEDED',defaultDatasetId:'fixture-shopee'}})};
  if(url.includes('/datasets/'))return {ok:true,json:async()=>[{nome:'Tinta impermeabilizante fixture',preco:100,url:shopeeUrl}]};
  throw Error('Unexpected request');
 };
 const start=await startSocialRadar({includeMarketplaces:true,query:'tinta impermeabilizante',location:'Uberlândia-MG',sourceUrls:[shopeeUrl]},{paidPermit:{actorUsd:0.1,maxActors:5,serperQueries:2},apifyToken:'fixture',fetcher,serperKey:''});
 assert.equal(start.done,false);const r=await pollSocialRadar({job:start.job},{paidPermit:{actorUsd:0.1,maxActors:5,serperQueries:2},apifyToken:'fixture',fetcher});assert.equal(r.done,true);assert.equal(r.leads.length,0);assert.equal(r.marketplaceSignals.length,1);
});
test('dataset read failure terminates with an explicit warning instead of polling forever',async()=>{
 const job=issueJob({query:'tinta',location:'Uberlândia-MG',count:5,runs:[{platform:'shopee',runId:'fixture',url:shopeeUrl}],warnings:[],expiresAt:Date.now()+1000},'fixture');
 const r=await pollSocialRadar({job},{paidPermit:{actorUsd:0.1,maxActors:5,serperQueries:2},apifyToken:'fixture',fetcher:async url=>url.includes('actor-runs')?{ok:true,json:async()=>({data:{status:'SUCCEEDED',defaultDatasetId:'fixture'}})}:{ok:false,status:403}});
 assert.equal(r.done,true);assert.equal(r.leads.length,0);assert.ok(r.meta.warnings.some(w=>w.includes('HTTP 403')));
});
test('business collector extracts literal public contact links and never expands to a different identity',async()=>{
 const html='<title>Tintas Fixture</title><h1>Tintas Fixture</h1><a href="mailto:comercial@fixture.test">Comercial</a><a href="tel:+553433331234">Telefone</a><a href="https://fixture.test/contato">Contato</a><a href="https://other.test/contato">Outro</a>';
 const contacts=publishedBusinessContacts(html,'https://fixture.test');assert.equal(contacts.email.value,'comercial@fixture.test');assert.equal(contacts.phone.value,'+553433331234');assert.ok(contacts.email.excerpt.includes('mailto:'));
 const visited=[];const lead=await enrichBusinessContacts({name:'Tintas Fixture',website:'https://fixture.test',phone:'',email:'',evidence:{}},{readPage:async url=>{visited.push(url);return {url,html}}});
 assert.equal(lead.email,'comercial@fixture.test');assert.equal(lead.decisionMakerPhone,undefined);assert.ok(visited.every(u=>u.startsWith('https://fixture.test')));
 const other=await enrichBusinessContacts({name:'Outro Negócio',website:'https://fixture.test',phone:'',email:'',evidence:{}},{readPage:async url=>({url,html})});assert.equal(other.email,'');
});
test('blocked contact pages leave missing fields missing',async()=>{
 const lead={name:'Fixture',website:'https://fixture.test',phone:'',email:'',evidence:{}};
 assert.deepEqual(await enrichBusinessContacts(lead,{readPage:async()=>{throw Error('403')}}),lead);
 assert.equal(publishedBusinessContacts('<a href="mailto:fake[at]fixture.test">Email</a>','https://fixture.test').email,undefined);
});
