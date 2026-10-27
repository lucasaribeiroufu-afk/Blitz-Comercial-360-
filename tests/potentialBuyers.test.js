import test from 'node:test';
import assert from 'node:assert/strict';
import {searchBusinesses} from '../src/server/verifiedSearch.js';
const place = (id,name,category) => ({id,displayName:{text:name},primaryTypeDisplayName:{text:category},formattedAddress:'Uberlândia - MG',googleMapsUri:`https://maps.google.com/?cid=${id}`,nationalPhoneNumber:'(34) 3333-3333',websiteUri:'https://farm.example.test'});
test('potential iodine buyers use explicit sectors, reject unrelated stations, preserve Maps and published purchasing contact',async()=>{
 const result=await searchBusinesses({query:'compradores de iodo 10%',location:'Brasil',count:4,prospectMode:'potential',targetEntityType:'both',targetSectors:['fazendas leiteiras']},{mapsKey:'fixture',fetcher:async(_url,options)=>{assert.equal(JSON.parse(options.body).textQuery,'fazendas leiteiras em Brasil');return {ok:true,json:async()=>({places:[place('1','Fazendas Leiteiras Fixture','Fazendas leiteiras'),place('2','Posto Fixture','Posto de combustível')]})};},readPage:async url=>({url,html:'<title>Fazendas Leiteiras Fixture</title><script type="application/ld+json">{"@type":"Organization","name":"Fazendas Leiteiras Fixture","employee":{"@type":"Person","name":"Ana Fixture","jobTitle":"Gerente de compras","telephone":"(34) 99999-9999"}}</script>'})});
 assert.equal(result.leads.length,1);
 const lead=result.leads[0];
 assert.equal(lead.recordType,'potential_company');assert.equal(lead.matchedProduct,'iodo 10%');
 assert.match(lead.prospectingBasis,/não comprovados/);assert.match(result.meta.summary,/não comprovados/);
 assert.equal(lead.phone,'(34) 3333-3333');assert.equal(lead.decisionMaker,'Ana Fixture');assert.equal(lead.decisionMakerPhone,'(34) 99999-9999');
 assert.match(lead.evidence.decisionMaker.sourceUrl,/farm.example/);assert.match(lead.profileUrl,/maps.google/);
});
test('potential mode requires explicit sectors and never invents a responsible person',async()=>{
 await assert.rejects(searchBusinesses({query:'iodo 10%',prospectMode:'potential'},{}),/segmentos/);
 const result=await searchBusinesses({query:'iodo 10%',location:'Brasil',prospectMode:'potential',targetSectors:['fazendas leiteiras']},{mapsKey:'fixture',fetcher:async()=>({ok:true,json:async()=>({places:[place('1','Fazendas Leiteiras Fixture','Fazendas leiteiras')]})}),readPage:async url=>({url,html:'<title>Fazendas Leiteiras Fixture</title><p>Entre em contato com nossa equipe.</p>'})});
 assert.equal(result.leads[0].decisionMaker,'');assert.equal(result.leads[0].decisionMakerPhone,'');assert.equal(result.leads[0].email,'');
});
