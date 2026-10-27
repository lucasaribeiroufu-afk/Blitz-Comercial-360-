import test from 'node:test';
import assert from 'node:assert/strict';
import {requestsBuyers, isBuyerSearch, buyerLocation} from '../src/utils/searchScope.js';
import {intentAssessment, productQuery, declaredRegion} from '../src/server/purchaseIntent.js';
import {searchBusinesses} from '../src/server/verifiedSearch.js';
test('buyer requests in both or company mode never call Places or return gas stations',async()=>{
 for(const query of ['compra de iodo 10%', 'compradores de iodo 10%']) {
  assert.ok(requestsBuyers(query));
  assert.equal(productQuery(query),'iodo 10%');
  for(const targetEntityType of ['both','pj']) {
   let collected=false;
   const result=await searchBusinesses({query,location:'Brasil',count:4,targetEntityType},{limits:{enabled:false},store:null,fetcher:()=>assert.fail('Places must not be called'),collectWorker:async body=>{collected=true;assert.equal(body.query,'iodo 10%');assert.equal(body.location,'Brasil');return {records:[],reports:[],pending:[]};}});
   assert.ok(collected);assert.deepEqual(result.leads,[]);
  }
 }
 assert.equal(isBuyerSearch('postos de combustível','both'),false);
});
test('blank and national scope never become São Paulo and do not claim residence without evidence',()=>{
 for(const value of ['', 'Brasil', 'Brasil todo', 'todo o Brasil']) assert.equal(buyerLocation(value),'Brasil');
 assert.equal(buyerLocation('Uberlândia - MG'),'Uberlândia - MG');
 assert.equal(declaredRegion('Quero comprar iodo 10%.','Brasil').status,'unconfirmed');
 assert.equal(declaredRegion('Moro em Uberlândia MG. Quero comprar iodo 10%.','Brasil').matched,true);
 assert.equal(declaredRegion('Moro em Recife PE. Quero comprar iodo 10%.','Brasil').matched,true);
});
test('iodine concentration and purchase intent are required, not a number elsewhere or a seller listing',()=>{
 assert.equal(intentAssessment('Quero comprar iodo 10%.','iodo 10%').qualified,true);
 for(const text of ['Quero comprar iodo 1%.','Quero comprar iodo 10,5%.','Quero comprar 10 litros de iodo.','Vendo iodo 10%.','Posto de combustível']) {
  assert.equal(intentAssessment(text,'iodo 10%').qualified,false,text);
 }
});
