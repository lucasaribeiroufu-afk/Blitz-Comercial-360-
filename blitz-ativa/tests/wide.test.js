import test from 'node:test';
import assert from 'node:assert/strict';
import {config} from '../config.js';
import {socialEvidence} from '../social.js';
import {collectYoutube} from '../youtube.js';
import {collectAtivaBatch} from '../../src/server/ativaBatch.js';
import {embeddedRequest} from '../../src/server/ativaEmbedded.js';
import {sweepSchedules} from '../../src/server/ativaSchedules.js';

const now = Date.parse('2026-11-22T12:00:00Z');
const input = config({query:'tinta impermeabilizante',location:'Brasil',audience:'both',wide:true,sources:['https://public.example/a'],discover:false});
const emptyYoutube = async()=>({records:[],reports:[]});

test('wide collection retains pending sources and merges stable record identities',async()=>{
  const first = await collectAtivaBatch({input,records:[{key:'old'}]}, {ativaYoutube:emptyYoutube,ativaCrawl:async()=>({
    records:[{key:'old'},{key:'new'}],pages:[{url:'https://public.example/a',status:'collected'}],pending:['https://public.example/b'],limited:true,
  })});
  assert.equal(first.job.status,'waiting');
  assert.equal(first.job.records.length,2);
  const second = await collectAtivaBatch(first.job,{ativaYoutube:()=>assert.fail('YouTube runs once'),ativaCrawl:async options=>{
    assert.deepEqual(options.sources,['https://public.example/b']);
    assert.deepEqual(options.visitedSources,['https://public.example/a']);
    return {records:[{key:'new'}],pages:[{url:options.sources[0],status:'collected'}],pending:[],limited:false};
  }});
  assert.equal(second.job.status,'finished');assert.equal(second.job.progress.batches,2);
  assert.equal(second.job.records.length,2);
});

test('DOM context qualifies only an identified, recent comment without personal contact fields',()=>{
  const rows=[{text:'Quero comprar esse produto!',name:'Autor',sourceUrl:'https://www.instagram.com/p/POST/',
    authorUrl:'https://www.instagram.com/autor/',publishedAt:'2026-11-21',platform:'instagram',
    context:'Vendo tinta impermeabilizante',contextUrl:'https://www.instagram.com/p/POST/',phone:'private'}];
  const record=socialEvidence(rows,input,now)[0];
  assert.equal(record.recordType,'purchase_mention');assert.equal(record.reviewRequired,true);
  assert.equal(record.phone,undefined);assert.equal(record.intent,rows[0].text);
  assert.equal(socialEvidence([{...rows[0],publishedAt:''}],input,now).length,0);
  assert.equal(socialEvidence([{...rows[0],contextUrl:'https://other.example/post'}],input,now).length,0);
});

test('YouTube is dormant without a key and preserves source comment identity when configured',async()=>{
  assert.equal((await collectYoutube(input,{youtubeKey:'',fetcher:()=>assert.fail('No key')})).reports[0].status,'not_configured');
  const key='fixture-secret';
  const result=await collectYoutube(input,{youtubeKey:key,fetcher:async(url,options)=>{
    assert.equal(options.headers['X-Goog-Api-Key'],key);
    assert.equal(url.search.includes(key),false);
    const resource=url.pathname.split('/').at(-1);
    if(resource==='search')return Response.json({items:[{id:{videoId:'abcdefghijk'}}]});
    if(resource==='videos')return Response.json({items:[{id:'abcdefghijk',snippet:{title:'Tinta impermeabilizante',description:'Demonstração'}}]});
    const snippet={textDisplay:'Quero comprar!',authorDisplayName:'Autor',authorChannelUrl:'https://www.youtube.com/channel/example',publishedAt:new Date(Date.now()-1000).toISOString()};
    if(resource==='comments') {
      assert.equal(url.searchParams.get('parentId'),'parent-comment');
      return Response.json({items:[{id:'public-reply',snippet}]});
    }
    if(!url.searchParams.has('pageToken')) {
      return Response.json({nextPageToken:'next',items:[{snippet:{totalReplyCount:1,topLevelComment:{id:'parent-comment'}}}]});
    }
    assert.equal(url.searchParams.get('pageToken'),'next');
    return Response.json({items:[{snippet:{topLevelComment:{id:'public-comment',snippet}}}]});
  }});
  assert.equal(result.records[0].platform,'youtube');
  assert.deepEqual(result.records.map(record=>new URL(record.profileUrl).searchParams.get('lc')).sort(),['public-comment','public-reply']);
  assert.equal(result.reports[0].received,3);
  assert.deepEqual(result.pending,[]);
  assert.equal(JSON.stringify(result).includes(key),false);
});

test('persistent continuation keeps the same job, isolates accounts and fences stale completions',async()=>{
  const data=new Map();
  const reference=path=>({collection:name=>reference(`${path}/${name}`),doc:name=>reference(`${path}/${name}`),
    get:async()=>({data:()=>data.get(path)}),set:async value=>{data.set(path,value);}});
  const db={collection:name=>reference(name),runTransaction:async callback=>callback({get:ref=>ref.get(),set:(ref,value)=>ref.set(value)})};
  let calls=0;
  const deps={ativaDb:db,ativaYoutube:emptyYoutube,ativaCrawl:async options=>{
    calls++;
    return {records:[],pages:[{url:options.sources[0],status:'collected'}],pending:calls===1?['https://public.example/b']:[],limited:calls===1};
  }};
  const first=await embeddedRequest('/v1/jobs','alice',{...input,requestKey:'wide'},deps);
  assert.equal(first.status,'waiting');
  const repeated=await embeddedRequest('/v1/jobs','alice',{...input,requestKey:'wide'},deps);
  assert.equal(repeated.id,first.id);assert.equal(calls,1);
  await assert.rejects(embeddedRequest(`/v1/jobs/${first.id}/continue`,'bob',{},deps),/inexistente/);
  const second=await embeddedRequest(`/v1/jobs/${first.id}/continue`,'alice',{},deps);
  assert.equal(second.id,first.id);assert.equal(second.status,'finished');assert.equal(calls,2);
  await embeddedRequest(`/v1/jobs/${first.id}/continue`,'alice',{},deps);assert.equal(calls,2);
  deps.ativaCrawl=async()=>{
    const path=[...data.keys()].find(path=>path.includes('/ativaJobs/') && data.get(path).status==='running');
    data.set(path,{...data.get(path),leaseToken:'newer-owner',status:'finished'});
    return {records:[{key:'stale'}],pages:[],pending:[],limited:false};
  };
  const fenced=await embeddedRequest('/v1/jobs','alice',{...input,requestKey:'fence'},deps);
  assert.equal(fenced.leaseToken,'newer-owner');assert.equal(fenced.records.length,0);
});

test('large evidence is bounded before Firestore storage',async()=>{
  const result=await collectAtivaBatch({input,records:[]},{ativaYoutube:emptyYoutube,ativaCrawl:async()=>({
    records:Array.from({length:200},(_,index)=>({key:String(index),intent:'x'.repeat(12000)})),pages:[],pending:[],limited:false,
  })});
  assert.ok(Buffer.byteLength(JSON.stringify(result.job))<=850000);
  assert.equal(result.job.report.recordLimitReached,true);
});

test('scheduled collector rejects missing and mismatched credentials before touching data',async()=>{
  await assert.rejects(sweepSchedules({headers:{}},{cronSecret:'x'.repeat(32),ativaDb:{}}),error=>error.status===401);
  await assert.rejects(sweepSchedules({headers:{authorization:'Bearer short'}},{cronSecret:'short',ativaDb:{}}),error=>error.status===401);
});

test('background dispatcher resumes the job in the original account and persists novelty receipts',async()=>{
  const data=new Map();
  const now=Date.now();
  const schedulePath='_blitzAtivaSchedules/alice';
  data.set(schedulePath,{userId:'alice',input,intervalMinutes:60,enabled:true,nextAt:now-1000,leaseUntil:0,currentJobId:'original'});
  const reference=path=>({
    collection:name=>reference(`${path}/${name}`),doc:name=>reference(`${path}/${name}`),
    get:async()=>({exists:data.has(path),data:()=>data.get(path)}),
    set:async value=>{data.set(path,value);},
    where:()=>reference(path),orderBy:()=>reference(path),limit:()=>({get:async()=>({docs:[{ref:reference(schedulePath)}]})}),
  });
  const db={collection:name=>reference(name),runTransaction:async callback=>callback({
    get:ref=>ref.get(),getAll:(...refs)=>Promise.all(refs.map(ref=>ref.get())),set:(ref,value)=>ref.set(value),
  })};
  const secret='x'.repeat(32);
  const deps={ativaDb:db,cronSecret:secret,scheduledSession:async userId=>{assert.equal(userId,'alice');return 'fixture';},
    scheduledRequest:async(path,userId,payload,options)=>{
      assert.equal(path,'/v1/jobs/original/continue');assert.equal(userId,'alice');assert.equal(options.authToken,'fixture');
      return {id:'original',status:'finished',records:[{key:'same-publication'}]};
    }};
  const first=await sweepSchedules({headers:{authorization:`Bearer ${secret}`}},deps);
  assert.equal(first.newRecords,1);assert.equal(data.get(schedulePath).currentJobId,null);
  data.set(schedulePath,{...data.get(schedulePath),nextAt:now-1000,currentJobId:'original'});
  const second=await sweepSchedules({headers:{authorization:`Bearer ${secret}`}},deps);
  assert.equal(second.newRecords,0);
});

test('resuming legacy queues refreshes discovery before requesting unrelated pending domains',async()=>{
  const queryInput={...input,discover:true,sources:[]};
  const old={input:queryInput,records:[],progress:{seen:[],pending:['https://sports.example/schedule'],batches:1,pages:1},
    report:{discovery:{sources:['https://sports.example/'],candidates:[],reports:[]},reports:[]}};
  const result=await collectAtivaBatch(old,{ativaDiscover:async()=>({relevanceVersion:1,sources:['https://paint.example/'],candidates:[],reports:[]}),
    ativaYoutube:emptyYoutube,ativaCrawl:async options=>{
      assert.deepEqual(options.sources,['https://paint.example/']);
      return {records:[],pages:[{url:options.sources[0],status:'collected'}],pending:[],limited:false};
    }});
  assert.equal(result.job.report.discovery.relevanceVersion,1);
  assert.equal(result.job.status,'finished');
});
