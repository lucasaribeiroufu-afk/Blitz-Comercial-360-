import test from 'node:test';
import assert from 'node:assert/strict';
import {productQuery,productVariants,intentAssessment,declaredRegion,discoveryQueries} from '../src/server/purchaseIntent.js';
import {normalizeSocialRows,qualifySocialRecord,startSocialRadar,pollSocialRadar,issueJob,verifyJob,platformUrl} from '../src/server/socialRadar.js';
import {casaCnpjLookup} from '../src/server/verifiedSearch.js';
const text='Quero comprar tinta impermeabilizante. Moro em Uberlândia-MG. Meu whatsapp: (34) 99999-1234';
const record={text,name:'fixture_user',authorUrl:'https://www.instagram.com/fixture_user/',sourceUrl:'https://www.instagram.com/p/FIXTURE/',publishedAt:'2026-10-12T12:00:00Z',id:'fixture-comment'};
test('free text queries support varied niches without replacing the requested product',()=>{
 assert.equal(productQuery('pessoa querendo comprar tinta impermeabilizante'),'tinta impermeabilizante');
 assert.ok(productVariants('geladeira').includes('refrigerador'));
 assert.equal(intentAssessment(text,'tinta impermeabilizante').qualified,true);
 assert.equal(intentAssessment('Quero comprar tinta emborrachada impermeabilizante','tinta impermeabilizante').qualified,true);
 assert.equal(intentAssessment('Quero comprar tinta branca','tinta impermeabilizante').qualified,false);
 assert.equal(intentAssessment('Vendo tinta impermeabilizante. Quero comprar mais estoque','tinta impermeabilizante').qualified,false);
 assert.equal(intentAssessment('Não quero comprar tinta impermeabilizante','tinta impermeabilizante').qualified,false);
 assert.equal(intentAssessment('Já comprei tinta impermeabilizante','tinta impermeabilizante').qualified,false);
 assert.equal(intentAssessment('Preciso de balança para gado','balança para gado').qualified,true);
 assert.equal(intentAssessment('Onde comprar notebook gamer?','notebook gamer').qualified,true);
 assert.ok(discoveryQueries('tinta impermeabilizante','Uberlândia-MG').every(s=>s.q.includes('Uberlândia-MG')));
});
test('a local group or seller city never proves a commenter region',()=>{
 assert.equal(declaredRegion(text,'Uberlândia - MG').matched,true);
 assert.equal(declaredRegion('Grupo Uberlândia-MG. Quero comprar tinta impermeabilizante','Uberlândia-MG').matched,false);
 assert.equal(declaredRegion('Moro em Uberaba. Quero comprar tinta impermeabilizante','Uberlândia-MG').matched,false);
 assert.equal(declaredRegion('Moro em Uberlândia-SP','Uberlândia-MG').matched,false);
});
test('social author/contact comes only from the specific row and self-published contact',()=>{
 const lead=qualifySocialRecord(record,'instagram','tinta impermeabilizante','Uberlândia-MG');
 assert.equal(lead.phone,'(34) 99999-1234');assert.equal(lead.authorProfileUrl,record.authorUrl);assert.equal(lead.whatsapp,'');assert.equal(lead.decisionMakerPhone,'');assert.equal(lead.publishedAt,record.publishedAt);assert.equal(lead.rating,undefined);assert.equal(lead.evidence.intent.recordId,'fixture-comment');
 const no=qualifySocialRecord({...record,text:'Quero comprar tinta impermeabilizante, sou de Uberlândia-MG. Telefone da loja (34) 99999-1234'},'instagram','tinta impermeabilizante','Uberlândia-MG');assert.equal(no.phone,'');
 assert.equal(qualifySocialRecord({...record,name:'*****'},'instagram','tinta impermeabilizante','Uberlândia-MG'),null);
 assert.equal(qualifySocialRecord({...record,text:'Quero comprar tinta impermeabilizante'},'instagram','tinta impermeabilizante','Uberlândia-MG'),null);
});
test('dataset adapters do not assign post author/phone to a different commenter',()=>{
 const rows=normalizeSocialRows([{text:'Vendo tinta impermeabilizante',user:{name:'Seller'},url:'https://www.facebook.com/groups/fixture/permalink/1',topComments:[{text,name: 'ignored',profileName:'Buyer',profileUrl:'https://www.facebook.com/fixture',commentUrl:'https://www.facebook.com/groups/fixture/permalink/1?comment_id=2'}]}],'facebook','');
 assert.equal(rows[1].name,'Buyer');assert.equal(rows[1].text,text);
 const tiktok=normalizeSocialRows([{text,uniqueId:'fixture',videoWebUrl:'https://www.tiktok.com/@fixture/video/123',createTimeISO:'2026-10-12',cid:'1'}],'tiktok','');assert.equal(tiktok[0].authorUrl,'https://www.tiktok.com/@fixture');
});
test('job signatures stop arbitrary dataset enumeration and expire',()=>{
 const token=issueJob({runs:[],expiresAt:Date.now()+1000},'fixture-secret');assert.equal(verifyJob(token,'fixture-secret').runs.length,0);
 assert.throws(()=>verifyJob(token,'another-secret'),/autorizada/);
 assert.throws(()=>verifyJob(issueJob({expiresAt:0},'fixture-secret'),'fixture-secret'),/expirada/);
});
test('Apify job starts asynchronously with bounded actor input and polls a real dataset',async()=>{
 const fetcher=async(url,opts)=>{
  if(url.includes('/runs?')) {const input=JSON.parse(opts.body);assert.equal(input.directUrls[0],record.sourceUrl);assert.ok(input.resultsLimit<=100);assert.equal(opts.headers.Authorization,'Bearer fixture-secret');assert.ok(!url.includes('fixture-secret'));return {ok:true,json:async()=>({data:{id:'fixture-run'}})};}
  if(url.includes('/actor-runs/'))return {ok:true,json:async()=>({data:{status:'SUCCEEDED',defaultDatasetId:'fixture-dataset'}})};
  if(url.includes('/datasets/'))return {ok:true,json:async()=>[{text,ownerUsername:'fixture_user',timestamp:record.publishedAt,id:record.id}]};
  throw Error('unexpected URL');
 };
 const start=await startSocialRadar({query:'pessoa querendo comprar tinta impermeabilizante',location:'Uberlândia-MG',count:5,sourceUrls:[record.sourceUrl]},{apifyToken:'fixture-secret',fetcher});
 assert.equal(start.done,false);assert.equal(start.leads.length,0);
 const poll=await pollSocialRadar({job:start.job},{apifyToken:'fixture-secret',fetcher});assert.equal(poll.done,true);assert.equal(poll.leads.length,1);assert.equal(poll.leads[0].name,'fixture_user');
});
test('invalid source URLs, absent credentials and failed Actors never create leads',async()=>{
 assert.equal(platformUrl('https://instagram.com.evil.test/p/abc/','instagram'),'');
 assert.equal(platformUrl('https://www.instagram.com/fixture_profile/','instagram'),'');
 await assert.rejects(startSocialRadar({query:'tinta',location:'Uberlândia-MG'},{apifyToken:''}),/APIFY_API_TOKEN/);
 const payload={query:'tinta',location:'Uberlândia-MG',count:5,runs:[{platform:'instagram',runId:'fixture',url:record.sourceUrl}],warnings:[],expiresAt:Date.now()+1000};
 const r=await pollSocialRadar({job:issueJob(payload,'fixture')},{apifyToken:'fixture',fetcher:async()=>({ok:true,json:async()=>({data:{status:'FAILED'}})})});assert.equal(r.done,true);assert.equal(r.leads.length,0);assert.ok(r.meta.warnings.some(w=>w.includes('FAILED')));
});
test('Casa dos Dados queries exact CNPJ, not fuzzy personal identity matches',async()=>{
 const lead=await casaCnpjLookup({cnpj:'11222333000181'},{casaKey:'fixture',fetcher:async(url,opts)=>{assert.ok(url.endsWith('/11222333000181'));assert.equal(opts.headers['api-key'],'fixture');return {ok:true,json:async()=>({cnpj:'11222333000181',razao_social:'Fixture LTDA',endereco:{municipio:'Uberlândia',uf:'MG'},quadro_societario:[{nome:'Sócio Fixture',qualificacao_socio:'Sócio'}]})}}});
 assert.equal(lead.decisionMaker,'');assert.equal(lead.phone,'');assert.equal(lead.socios[0].nome,'Sócio Fixture');assert.ok(lead.evidence.cnpj.source.includes('Casa dos Dados'));
});
