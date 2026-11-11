import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {createHandler} from '../server.js';

test('serverless handler fails closed and accepts authorized Vercel JSON bodies',async()=>{
 const original=process.env.SOCIAL_WORKER_TOKEN;
 let called=0;
 const handler=createHandler(async input=>{called++;return {records:[],query:input.query};});
 const request=async(method,url,body,authorization)=>{
   const req=Object.assign(Readable.from([]),{method,url,body,headers:{authorization}});
   let status,result;
   const res={writeHead(code){status=code;},end(text){result=JSON.parse(text);}};
   await handler(req,res);return {status,result};
 };
 try {
   delete process.env.SOCIAL_WORKER_TOKEN;
   assert.equal((await request('GET','/health')).result.configured,false);
   assert.equal((await request('POST','/collect',{})).status,503);
   process.env.SOCIAL_WORKER_TOKEN='a'.repeat(64);
   assert.equal((await request('GET','/health')).result.status,'ok');
   assert.equal((await request('POST','/collect',{})).status,401);
   assert.equal(called,0);
   const auth='Bearer '+process.env.SOCIAL_WORKER_TOKEN;
   assert.equal((await request('POST','/collect',{query:'tinta',location:'Brasil'},auth)).status,200);
   assert.equal(called,1);
   assert.equal((await request('POST','/collect',null,auth)).status,400);
   assert.equal((await request('POST','/collect',{query:'a'.repeat(12001)},auth)).status,413);
 } finally {
   if(original===undefined)delete process.env.SOCIAL_WORKER_TOKEN;else process.env.SOCIAL_WORKER_TOKEN=original;
 }
});
