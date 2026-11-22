import test from 'node:test';
import assert from 'node:assert/strict';
import {config} from '../config.js';
import {discover} from '../discovery.js';
import {extract} from '../extract.js';
import {run} from '../runner.js';

const input = config({query:'tinta impermeabilizante',location:'Brasil',audience:'both'});
const now = Date.parse('2026-11-22T10:00:00Z');
const author = {'@type':'Person',name:'Autor público'};
const comment = text=>({'@type':'Comment',text,author,datePublished:'2026-11-21',url:'https://public.example/comment/1'});
const html = object=>`<script type="application/ld+json">${JSON.stringify(object)}</script>`;

test('a product alone starts discovery and never qualifies search snippets',async()=>{
  assert.equal(input.discover,true);
  const result = await discover(input,{maxQueries:1,read:async()=>({status:200,body:JSON.stringify({results:[
    {url:'https://public.example/post?utm_source=test',title:'Quero comprar tinta impermeabilizante'},
    {url:'https://public.example/post',title:'Repeated'},
    {url:'http://private.example',title:'Invalid'},
  ]})})});
  assert.deepEqual(result.sources,['https://public.example/post']);
  assert.equal(result.records,undefined);
  assert.equal(result.candidates[0].status,'discovered');
});

test('quota refusal stops discovery without rotating identities or endpoints',async()=>{
  let calls=0;
  const result=await discover(input,{read:async()=>{calls++;return {status:429,body:''};}});
  assert.equal(calls,1);assert.equal(result.reports[0].status,'blocked');
});

test('nested reply uses its parent product while preserving original evidence and date',()=>{
  const parent={'@type':'SocialMediaPosting',text:'Vendemos tinta impermeabilizante.',url:'https://public.example/post',comment:[comment('Quero comprar esse produto!')]};
  const result=extract(html(parent),'https://public.example/post',input,now);
  const record=result.records[0];
  assert.equal(record.recordType,'purchase_mention');
  assert.equal(record.intent,'Quero comprar esse produto!');
  assert.equal(record.reviewRequired,true);
  assert.equal(record.evidence.context.excerpt,parent.text);
  assert.equal(record.evidence.context.sourceUrl,parent.url);
  assert.equal(record.location,'');
});

test('ambiguous, unrelated, undated, cross-origin and negated replies cannot inherit purchase intent',()=>{
  for (const changes of [
    {text:'Quero comprar um carro'}, {text:'Não quero comprar esse produto'},
    {datePublished:undefined},
  ]) {
    const parent={'@type':'SocialMediaPosting',text:input.query,comment:[{...comment('Quero comprar'),...changes}]};
    assert.equal(extract(html(parent),'https://public.example/post',input,now).records.length,0);
  }
  const parent={'@type':'SocialMediaPosting',text:'tinta impermeabilizante e tapete de borracha',comment:[comment('Quero comprar')]};
  assert.equal(extract(html(parent),'https://public.example/post',{...input,alternatives:['tapete de borracha']},now).records.length,0);
  parent.url='https://other.example/post';parent.text=input.query;
  assert.equal(extract(html(parent),'https://public.example/post',input,now).records.length,0);
});

test('price question in a seller thread remains a price question',()=>{
  const parent={'@type':'SocialMediaPosting',text:input.query,comment:[comment('Quanto custa?')]};
  assert.equal(extract(html(parent),'https://public.example/post',input,now).records[0].recordType,'price_question');
});

test('microdata comment has its own author and date with scoped parent context',()=>{
  const page=`<article itemscope itemtype="https://schema.org/SocialMediaPosting"><h1 itemprop="headline">Tinta impermeabilizante</h1>
    <div itemscope itemtype="https://schema.org/Comment"><span itemprop="author">Autor público</span><time itemprop="datePublished" datetime="2026-11-21"></time><p itemprop="text">Quero comprar!</p></div></article>`;
  const record=extract(page,'https://public.example/post',input,now).records[0];
  assert.equal(record.name,'Autor público');assert.equal(record.reviewRequired,true);
});

test('discovery success without readable pages is unavailable collection',async()=>{
  const result=await run({...input,pncp:false},{discover:async()=>({sources:[],candidates:[],reports:[{status:'collected'}]})});
  assert.equal(result.report.state,'unavailable');assert.equal(result.report.paidProviderCalls,0);
});


test('social links expand only product-related pages and remain behind destination robots',async()=>{
  const {crawl}=await import('../crawler.js');
  const calls=[];
  const result=await crawl({...input,sources:['https://public.example/'],maxPages:3,maxDepth:1},{delayMs:0,read:async url=>{
    calls.push(url);
    if(url === 'https://www.instagram.com/robots.txt') return {status:200,body:`User-agent: *\nDisallow: /`,headers:{}};
    if(url.endsWith('/robots.txt')) return {status:200,body:'',headers:{}};
    return {status:200,body:'<p>Tinta impermeabilizante</p><a href="https://www.instagram.com/publicbrand/">Marca</a>',headers:{}};
  }});
  assert.equal(calls.includes('https://www.instagram.com/publicbrand/'),false);
  assert.ok(result.pages.some(page=>page.status === 'blocked'));
});


test('unrelated indexed organizations do not become prospects for the requested product',()=>{
  const organization={'@type':'Organization',name:'Outro segmento',url:'https://public.example/'};
  assert.equal(extract(html(organization)+'<p>Posto de gasolina</p>','https://public.example/',input,now).records.length,0);
  assert.equal(extract(html(organization)+'<p>Tinta impermeabilizante</p>','https://public.example/',input,now).records.length,1);
});

test('authenticated SearXNG receives the session while the anonymous index never receives it',async()=>{
  const calls=[];
  const read=async(url,options)=>{calls.push({url,options});return {status:200,body:'{"results":[]}'};};
  await discover(input,{maxQueries:1,searxUrl:'https://search.example/',authToken:'fixture',read});
  assert.equal(calls[0].options.authorization,'Bearer fixture');
  assert.equal(new URL(calls[0].url).pathname,'/search');
  await discover(input,{maxQueries:1,searxUrl:'',authToken:'fixture',read});
  assert.equal(calls[1].options.authorization,undefined);
});

test('search-engine drift cannot queue unrelated sources even when the engine returns them',async()=>{
  const result=await discover(input,{maxQueries:1,searxUrl:'https://search.example/',read:async()=>({status:200,body:JSON.stringify({results:[
    {url:'https://sports.example/schedule',title:'Dallas football schedule',content:'Games and tickets'},
    {url:'https://paint.example/impermeabilizantes',title:'Tintas impermeabilizantes',content:'Revestimentos'},
  ]})})});
  assert.deepEqual(result.sources,['https://paint.example/impermeabilizantes']);
  assert.equal(result.reports[0].discardedIrrelevant,1);
});
