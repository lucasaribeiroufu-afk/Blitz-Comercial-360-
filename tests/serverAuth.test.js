import test from 'node:test';
import assert from 'node:assert/strict';
import {requireUser,protectedHandler} from '../src/server/serverAuth.js';
import {issueJob,pollSocialRadar} from '../src/server/socialRadar.js';
test('paid collection cannot be triggered without a valid login',async()=>{
 await assert.rejects(requireUser({headers:{}}),/Entre no aplicativo/);
 await assert.rejects(requireUser({headers:{authorization:'Bearer fixture'}},async()=>{throw Error('invalid token')}),/Sessão inválida/);
 const uid=await requireUser({headers:{authorization:'Bearer fixture'}},async()=>({uid:'fixture-user'}));assert.equal(uid,'fixture-user');
});
test('protected handler passes authenticated UID into the job operation',async()=>{
 const res={code:0,body:null,setHeader(){},status(n){this.code=n;return this},json(b){this.body=b;return this}};
 let called=false;
 await protectedHandler(async()=>{called=true})({method:'POST',headers:{},body:{}},res);assert.equal(res.code,401);assert.equal(called,false);
 await protectedHandler(async(_body,deps)=>({uid:deps.userId}),async()=>({uid:'fixture-user'}))({method:'POST',headers:{authorization:'Bearer fixture'},body:{}},res);assert.equal(res.code,200);assert.equal(res.body.uid,'fixture-user');
});
test('one authenticated account cannot read another account social job',async()=>{
 const job=issueJob({userId:'owner',expiresAt:Date.now()+1000,runs:[],warnings:[]},'fixture-secret');
 await assert.rejects(pollSocialRadar({job},{userId:'other',apifyToken:'fixture-secret'}),/outra conta/);
});
