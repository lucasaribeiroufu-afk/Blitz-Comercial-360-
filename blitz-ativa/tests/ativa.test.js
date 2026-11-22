import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {config, canonicalUrl} from '../config.js';
import {extract} from '../extract.js';
import {crawl} from '../crawler.js';
import {procurement} from '../pncp.js';
import {rawRead} from '../http.js';
import {Store} from '../store.js';
import {run} from '../runner.js';
import {createApp} from '../server.js';

const now = Date.parse('2026-11-21T18:00:00Z');
const options = config({query:'tinta impermeabilizante', location:'Uberlândia, MG', sources:['https://public.example/feed']});
const posting = (overrides = {}) => ({'@type':'DiscussionForumPosting',
  text:'Preciso comprar tinta impermeabilizante. Entrega em Uberlândia MG.',
  author:{'@type':'Organization', name:'Empresa de teste'}, datePublished:'2026-11-20',
  url:'https://public.example/pedido/1', ...overrides});
const page = object => `<html><script type="application/ld+json">${JSON.stringify(object)}</script></html>`;

test('configuration rejects credentials and invalid limits', () => {
  assert.throws(() => config({query:'x', sources:[],discover:false}), /fontes/);
  assert.throws(() => config({...options, maxPages:1000}), /Limite/);
  assert.throws(() => canonicalUrl('https://public.example/?api_key=secret'), /credencial/);
  assert.equal(canonicalUrl('https://public.example/post?utm_source=x#fragment'), 'https://public.example/post');
  assert.throws(() => rawRead('https://127.0.0.1/private'), /privado/);
  assert.throws(() => rawRead('https://[::1]/private'), /privado/);
});

test('qualified structured B2B publication retains exact evidence and stable identity', () => {
  const a = extract(page(posting()), options.sources[0], options, now);
  const b = extract(page(posting()), options.sources[0], options, now + 1000);
  assert.equal(a.records.length, 1);
  assert.equal(a.records[0].recordType, 'purchase_mention');
  assert.equal(a.records[0].evidence.intent.excerpt, posting().text);
  assert.equal(a.records[0].key, b.records[0].key);
  assert.equal(a.records[0].phone, undefined);
});

test('seller, completed purchase, undated and personal publications never become B2B demand', () => {
  for (const change of [
    {text:'Vendemos tinta impermeabilizante. Compre agora em Uberlândia MG.'},
    {text:'Já comprei tinta impermeabilizante. Entrega em Uberlândia MG.'},
    {datePublished:undefined}, {datePublished:'2020-01-01'}, {datePublished:'2030-01-01'},
    {author:{'@type':'Person', name:'Pessoa de teste'}}, {url:'https://elsewhere.example/post'},
  ]) assert.equal(extract(page(posting(change)), options.sources[0], options, now).records.filter(record => record.recordType === 'purchase_mention').length, 0);
});

test('region absent is retained as unconfirmed and divergent region is discarded', () => {
  const absent = extract(page(posting({text:'Preciso comprar tinta impermeabilizante.'})), options.sources[0], options, now);
  assert.equal(absent.records[0].recordType, 'region_unconfirmed');
  const divergent = extract(page(posting({text:'Preciso comprar tinta impermeabilizante. Moro em Curitiba PR.'})), options.sources[0], options, now);
  assert.equal(divergent.records.length, 0);
});

test('corporate structured contacts stay with their organization and never imply purchase', () => {
  const html = page({'@type':'Organization', name:'Empresa de teste', url:'https://public.example/',
    address:{addressLocality:'Uberlândia',addressRegion:'MG'},
    email:'compras@public.example', telephone:'+55 34 3000-1234'}) + '<a href="mailto:pessoa@example.test">Comentário</a>';
  const result = extract(html, options.sources[0], options, now);
  assert.equal(result.records[0].recordType, 'potential_company');
  assert.equal(result.records[0].email, 'compras@public.example');
  assert.equal(result.records[0].intent, undefined);
});

test('challenge is reported without extracting surrounding contact bait', () => {
  assert.equal(extract('<title>Verify you are human</title>' + page(posting()), options.sources[0], options, now).blocked, 'challenge_or_login');
});

test('robots denied redirect destination is never fetched, with bounded retries', async () => {
  const calls = [];
  const output = await crawl({...options, sources:['https://public.example/start']}, {delayMs:0, read:async url => {
    calls.push(url);
    if (url.endsWith('/robots.txt')) return {status:200, body:'User-agent: *\nDisallow: /private', headers:{}};
    return {status:302, body:'', headers:{location:'/private'}};
  }});
  assert.equal(output.pages[0].status, 'blocked');
  assert.equal(calls.includes('https://public.example/private'), false);
  assert.equal(output.pages[0].attempts, 1);
});

test('feed discovery follows same-origin links, deduplicates, and exposes crawl limit', async () => {
  const output = await crawl({...options, maxPages:1}, {delayMs:0, read:async url => ({status:200, headers:{},
    body:url.endsWith('/robots.txt') ? '' : '<rss><channel><item><link>https://public.example/post/1</link></item><item><link>https://other.example/post</link></item></channel></rss>'})});
  assert.equal(output.pages.length, 1);
  assert.equal(output.limited, true);
});

test('SQLite persists jobs, claims atomically and fences stale workers', () => {
  const folder = mkdtempSync(path.join(tmpdir(), 'blitz-ativa-'));
  const filename = path.join(folder, 'jobs.sqlite');
  let store = new Store(filename);
  try {
    const job = store.create(options);
    const lease = store.claim();
    assert.equal(store.claim(), undefined);
    store.db.prepare('UPDATE jobs SET lease_until=0 WHERE id=?').run(job.id);
    const recovered = store.claim();
    assert.throws(() => store.finish(lease, [], {}), /expirada/);
    store.addSource('local', {url:'https://public.example/feed',label:'Pedidos',keywords:'tinta impermeabilizante'});
    store.finish(recovered, [{key:'same', name:'A'}, {key:'same', name:'A'}], {state:'complete'}, '',
      [{url:'https://public.example/post',title:'Pedido',body:'Tinta impermeabilizante',fetchedAt:new Date().toISOString()}]);
    store.close(); store = new Store(filename);
    assert.equal(store.get(job.id).records.length, 1);
    assert.equal(store.get(job.id).status, 'finished');
    assert.equal(store.indexCount('local'),1);
    assert.equal(store.sources('local').length,1);
    assert.ok(store.discover('local','tinta impermeabilizante').includes('https://public.example/post'));
  } finally {store.close(); rmSync(folder, {recursive:true});}
});

test('PNCP inspects generic title items, paginates and requires an open proposal deadline', async () => {
  let itemPages = 0;
  const notice = {numeroControlePNCP:'12345678000199-1-000001/2026',
    orgaoEntidade:{razaoSocial:'Órgão de teste'}, unidadeOrgao:{municipioNome:'Uberlândia',ufSigla:'MG'},
    dataPublicacaoPncp:'2026-11-20T10:00:00', dataAberturaProposta:'2026-11-20T10:00:00',
    dataEncerramentoProposta:'2026-12-01T10:00:00', objetoCompra:'Materiais diversos'};
  const read = async url => {
    const parsed = new URL(url);
    if (parsed.pathname.includes('/itens')) {
      itemPages++;
      return {status:200, body:JSON.stringify(parsed.searchParams.get('pagina') === '1'
        ? Array.from({length:50}, () => ({descricao:'Item irrelevante'}))
        : [{numeroItem:51, descricao:'Tinta impermeabilizante branca', quantidade:10}])};
    }
    return {status:200, body:JSON.stringify({data:[notice],totalPaginas:1})};
  };
  const result = await procurement({...options, pncp:true, pncpPages:2}, {now, read, delayMs:0});
  assert.equal(result.records.length, 1);
  assert.equal(itemPages, 2);
  assert.equal(result.records[0].proposalDeadline, '2026-12-01T13:00:00.000Z');
  notice.dataEncerramentoProposta = '2026-11-01T10:00:00';
  assert.equal((await procurement({...options, pncp:true}, {now, read, delayMs:0})).records.length, 0);
});

test('source denial remains unavailable, never a completed negative search', async () => {
  const result = await run(options, {delayMs:0, read:async () => ({status:403, body:'', headers:{}})});
  assert.equal(result.report.state, 'unavailable');
  assert.equal(result.report.paidProviderCalls, 0);
});

test('API requires bearer auth and runs authenticated queued jobs through persistence', async () => {
  const store = new Store(':memory:');
  const token = 'x'.repeat(32);
  const app = createApp({store, token, execute:async () => ({records:[], report:{state:'complete', purchaseMentions:0}})});
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  try {
    assert.equal((await fetch(origin + '/v1/jobs', {method:'POST'})).status, 401);
    const response = await fetch(origin + '/v1/jobs', {method:'POST', headers:{Authorization:`Bearer ${token}`, 'Content-Type':'application/json'}, body:JSON.stringify(options)});
    assert.equal(response.status, 202);
    const job = await response.json();
    await app.tick();
    const result = await fetch(origin + job.statusPath, {headers:{Authorization:`Bearer ${token}`}});
    assert.equal((await result.json()).status, 'finished');
  } finally {await app.stop(); store.close();}
});

test('B2C qualifies an identified public request and keeps contact details out of extracted fields', () => {
  const b2c = {...options, audience:'b2c'};
  const post = posting({author:{'@type':'Person',name:'Autor de teste'},
    text:'Preciso comprar tinta impermeabilizante. Entrega em Uberlândia MG. Telefone 34999990000.'});
  const record = extract(page(post), options.sources[0], b2c, now).records[0];
  assert.equal(record.entityType, 'pf');
  assert.equal(record.recordType, 'purchase_mention');
  assert.equal(record.evidence.intent.excerpt, post.text);
  assert.equal(record.phone, undefined);
  assert.equal(extract(page(posting()), options.sources[0], b2c, now).records.length, 0);
  assert.equal(extract(page(post), options.sources[0], {...options,audience:'both'}, now).records.length, 1);
  for (const change of [{author:undefined},{datePublished:undefined},
    {text:'Vendo tinta impermeabilizante em Uberlândia MG.'},
    {text:'Já comprei tinta impermeabilizante em Uberlândia MG.'}]) {
    assert.equal(extract(page({...post,...change}), options.sources[0], b2c, now).records.filter(record => record.recordType === 'purchase_mention').length, 0);
  }
  assert.throws(() => config({...options,audience:'everyone'}), /Público/);
});

test('B2C labels the observed social platform and skips corporate procurement', async () => {
  const url = 'https://www.facebook.com/groups/public/posts/123/';
  const post = posting({url,author:{'@type':'Person',name:'Autor de teste'}});
  assert.equal(extract(page(post),url,{...options,audience:'b2c'},now).records[0].platform,'facebook');
  const result = await run({...options,sources:[],pncp:true,audience:'b2c'}, {
    fetcher:() => {throw Error('B2C must not query PNCP');}
  });
  assert.equal(result.report.state,'unavailable');
  assert.equal(result.records.length,0);
});

test('alternative products preserve the observed subject and experience never implies current purchase', () => {
  const input = {...options, audience:'b2c', alternatives:['tapete de borracha']};
  const author = {'@type':'Person',name:'Autor de teste'};
  for (const [text,type] of [
    ['Comprei tapete de borracha e não gostei. Moro em Uberlândia MG.','negative_experience'],
    ['Uso tapete de borracha e gostei. Moro em Uberlândia MG.','positive_experience'],
    ['Paguei R$ 300,00 no tapete de borracha. Moro em Uberlândia MG.','past_purchase'],
    ['Qual o preço do tapete de borracha? Moro em Uberlândia MG.','price_question'],
    ['Preciso comprar tapete de borracha. Moro em Uberlândia MG.','purchase_mention'],
  ]) {
    const record = extract(page(posting({text,author})),options.sources[0],input,now).records[0];
    assert.equal(record.recordType,type);
    assert.equal(record.matchedProduct,'tapete de borracha');
    assert.equal(record.evidence.intent.excerpt,text);
    if (type === 'past_purchase') assert.equal(record.reportedPrice,'R$ 300,00');
  }
  assert.equal(extract(page(posting({text:'Vendo tapete de borracha.',author})),options.sources[0],input,now).records.length,0);
});

test('structured public complaint retains the consumer review and never takes SAC contact as consumer', () => {
  const url = 'https://www.reclameaqui.com.br/fornecedor/reclamacao_123/';
  const review = {'@type':'Review',author:{'@type':'Person',name:'Autor de teste'},
    datePublished:'2026-11-20',url,reviewBody:'Comprei tinta impermeabilizante e não funcionou. Moro em Uberlândia MG.'};
  const html = page(review) + '<p>Resposta do fabricante: telefone SAC 0800 111 2222</p>';
  const record = extract(html,url,{...options,audience:'b2c'},now).records[0];
  assert.equal(record.platform,'reclame_aqui');
  assert.equal(record.recordType,'negative_experience');
  assert.equal(record.phone,undefined);
  assert.equal(record.evidence.intent.excerpt,review.reviewBody);
  assert.equal(extract(page({...review,author:undefined}),url,{...options,audience:'b2c'},now).records.length,0);
});

test('public DNS lookup supports Node autoSelectFamily all-address callback and rejects private targets', async () => {
  const {publicLookup} = await import('../http.js');
  const all = await new Promise((resolve,reject)=>publicLookup('8.8.8.8',{all:true},(error,value)=>error?reject(error):resolve(value)));
  assert.deepEqual(all,[{address:'8.8.8.8',family:4}]);
  const single = await new Promise((resolve,reject)=>publicLookup('8.8.8.8',{},(error,address,family)=>error?reject(error):resolve({address,family})));
  assert.deepEqual(single,{address:'8.8.8.8',family:4});
  await assert.rejects(new Promise((resolve,reject)=>publicLookup('127.0.0.1',{all:true},error=>error?reject(error):resolve())),/privado/);
});
