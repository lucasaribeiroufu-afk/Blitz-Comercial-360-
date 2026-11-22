import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../store.js';
import {createApp} from '../server.js';
import {config} from '../config.js';
import {quotaExhausted, attachAtivaFallback, ativaAction} from '../../src/server/ativa.js';
import {extract} from '../extract.js';
import {createHash} from 'node:crypto';
import {startBuyerRadar} from '../../src/server/buyerRadar.js';
import {quotaFailure} from '../../src/server/providerQuota.js';

test('source catalog and persistent text index remain scoped by account', () => {
  const store = new Store(':memory:');
  try {
    store.addSource('alice', {url:'https://public.example/sitemap.xml',label:'Compras de tintas',keywords:'tinta impermeabilizante'});
    assert.equal(store.discover('alice','tinta impermeabilizante').length, 1);
    assert.deepEqual(store.discover('bob','tinta impermeabilizante'), []);
    const input = config({query:'tinta', location:'Brasil', pncp:true});
    const a = store.create(input, 'alice', 'retry-1');
    assert.equal(store.create(input, 'alice', 'retry-1').id, a.id);
    assert.notEqual(store.create(input, 'bob', 'retry-1').id, a.id);
    assert.equal(store.get(a.id,'bob'), null);
    const job = store.claim();
    store.finish(job, [], {state:'complete'}, '', [{url:'https://public.example/pedido',title:'Compra publicada',body:'Pedido de tinta impermeabilizante',fetchedAt:new Date().toISOString()}]);
    assert.equal(store.indexCount('alice'), 1);
    assert.ok(store.discover('alice','tinta impermeabilizante').includes('https://public.example/pedido'));
    assert.equal(store.indexCount('bob'), 0);
  } finally {store.close();}
});

test('only explicit quota or configured budget exhaustion switches to Ativa', async () => {
  for (const message of ['HTTP 401','HTTP 429','Timeout','APIFY_API_TOKEN ausente.','CAPTCHA'])
    assert.equal(quotaExhausted([{errors:[message]}]), false);
  for (const message of ['Orçamento diário esgotado.','HTTP 402','Limite diário de consultas Serper atingido.','Limite de uso informado pelo Apify insuficiente.'])
    assert.equal(quotaExhausted([{limits:[message]}]), true);
  let calls = 0;
  const result = {leads:[],meta:{executionReport:{sources:[{limits:['Orçamento diário esgotado.']}],state:'unavailable'}}};
  const output = await attachAtivaFallback(result,{query:'tinta',location:'Brasil'}, {
    userId:'alice',ativaRequestKey:'stable',startAtiva:async body=>{calls++; assert.match(body.requestKey,/^stable-/);return {id:'run'};},
  });
  assert.equal(output.ativaJob.id,'run');
  assert.equal(output.meta.executionReport.state,'running');
  await attachAtivaFallback(output,{query:'tinta',location:'Brasil'}, {startAtiva:async()=>{calls++;}});
  assert.equal(calls,1);
});

test('provider credit errors are recognized without confusing generic access and rate limits', async () => {
  assert.equal(await quotaFailure(new Response(JSON.stringify({message:'Not enough credits'}), {status:403})), true);
  assert.equal(await quotaFailure(new Response(JSON.stringify({error:{type:'monthly-usage-limit-exceeded'}}), {status:403})), true);
  assert.equal(await quotaFailure(new Response(JSON.stringify({message:'Access denied'}), {status:403})), false);
  assert.equal(await quotaFailure(new Response(JSON.stringify({message:'Rate limit exceeded'}), {status:429})), false);
});

test('normal buyer radar entry point starts Ativa once the existing monetary reservation rejects the run', async () => {
  let fallbackCalls = 0;
  const result = await startBuyerRadar({query:'tinta impermeabilizante',location:'Brasil',count:4}, {
    userId:'alice',apifyToken:'fixture',limits:{enabled:true},
    store:{get:async()=>null,reserve:async()=>{throw Error('Orçamento diário esgotado.');}},
    collectWorker:async()=>({records:[],reports:[],pending:[]}),
    collectPncp:async()=>({leads:[],received:0,failures:0}),
    startAtiva:async()=>{fallbackCalls++;return {id:'queued-own-worker'};},
  });
  assert.equal(result.ativaJob.id,'queued-own-worker');
  assert.equal(fallbackCalls,1);
});

test('authenticated proxy queues, polls and imports original worker evidence into the same account CRM', async () => {
  const store = new Store(':memory:');
  const token = 'x'.repeat(32);
  const input = config({query:'tinta impermeabilizante',location:'Brasil',pncp:true});
  const html = `<script type="application/ld+json">${JSON.stringify({'@type':'DiscussionForumPosting',
    text:'Preciso comprar tinta impermeabilizante.',author:{'@type':'Organization',name:'Empresa de teste'},
    datePublished:new Date().toISOString(),url:'https://public.example/pedido'})}</script>`;
  const app = createApp({store, token, execute:async options=>({records:extract(html,'https://public.example/pedido',options).records,
    documents:[],report:{state:'complete',reports:[]}})});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  let saved;
  const deps = {userId:'alice',ativaUrl:'https://worker.example/',ativaToken:token,
    ativaFetcher:async (url, options)=>{
      assert.equal(options.headers['X-Blitz-User'],createHash('sha256').update('alice').digest('hex'));
      return fetch(origin + new URL(url).pathname, options);
    },
    saveCrm:async (body, context)=>{saved={body,context};return {ids:['contact-1']};}};
  try {
    const queued = await ativaAction({action:'start',...input,userId:'bob',requestKey:'test-retry'}, deps);
    const repeated = await ativaAction({action:'start',...input,requestKey:'test-retry'},deps);
    assert.equal(repeated.id,queued.id);
    await app.tick();
    const job = await ativaAction({action:'get',id:queued.id},deps);
    assert.equal(job.records.length,1);
    const result = await ativaAction({action:'saveToCrm',id:job.id,keys:[job.records[0].key],contacts:[{name:'Inventado'}]},deps);
    assert.deepEqual(result.ids,['contact-1']);
    assert.equal(saved.context.userId,'alice');
    assert.equal(saved.body.contacts[0].name,'Empresa de teste');
    assert.equal(saved.body.contacts[0].evidence.intent.sourceUrl,'https://public.example/pedido');
    const other = await fetch(origin + `/v1/jobs/${job.id}`, {headers:{Authorization:`Bearer ${token}`,'X-Blitz-User':'bob'}});
    assert.equal(other.status,404);
    await assert.rejects(()=>ativaAction({action:'saveToCrm',id:job.id,keys:['unknown']},deps), /indisponível/);
  } finally {await app.stop();store.close();}
});

test('own collection can run without a paid quota failure or financial budget', async () => {
  const result = {leads:[],meta:{executionReport:{sources:[],state:'unavailable'}}};
  const output = await attachAtivaFallback(result,{query:'tinta',location:'Brasil'}, {
    userId:'alice',freeOnly:true,startAtiva:async()=>({id:'own-free-run'})
  });
  assert.equal(output.ativaJob.id,'own-free-run');
});

test('embedded collector persists jobs by account, retries idempotently and excludes paid providers', async () => {
  const {embeddedRequest} = await import('../../src/server/ativaEmbedded.js');
  const data = new Map();
  const reference = path => ({
    collection:name=>reference(`${path}/${name}`),doc:name=>reference(`${path}/${name}`),
    get:async()=>({data:()=>data.get(path)}),set:async value=>{data.set(path,value);},
  });
  const db = {collection:name=>reference(name),runTransaction:async callback=>callback({
    get:ref=>ref.get(),set:(ref,value)=>{ref.set(value);}
  })};
  let calls = 0;
  const deps = {ativaDb:db,ativaCrawl:async input=>{
    calls++;assert.equal(input.maxPages,12);
    return {records:[],pages:[{status:'collected',url:input.sources[0]}],documents:[{url:input.sources[0],title:'tinta',body:'tinta'}],limited:false};
  }};
  const payload = {query:'tinta',audience:'b2c',sources:['https://public.example/'],requestKey:'same'};
  const first = await embeddedRequest('/v1/jobs','alice',payload,deps);
  assert.equal(first.status,'finished');assert.equal(first.report.paidProviderCalls,0);
  assert.equal((await embeddedRequest('/v1/jobs','alice',payload,deps)).id,first.id);
  assert.equal(calls,1);
  await assert.rejects(embeddedRequest(`/v1/jobs/${first.id}`,'bob',undefined,deps),/inexistente/);
  await embeddedRequest('/v1/jobs','bob',payload,deps);assert.equal(calls,2);
  deps.ativaDiscover=async()=>({sources:['https://discovered.example/'],candidates:[],reports:[{status:'collected',source:'Test index'}]});
  const automatic=await embeddedRequest('/v1/jobs','carol',{query:'tinta',sources:[],requestKey:'auto'},deps);
  assert.equal(automatic.status,'finished');
  assert.equal(automatic.input.discover,true);
  const catalog=await embeddedRequest('/v1/sources','carol',undefined,deps);
  assert.equal(catalog.sources[0].url,'https://discovered.example/');
});
