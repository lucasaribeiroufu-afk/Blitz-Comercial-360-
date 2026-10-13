import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveInstagram} from '../src/utils/instagramHelper';
import {resolveWhatsAppNumber} from '../src/utils/phoneHelper';
import {auditContactVeracity} from '../src/utils/contactVeracityAuditor';
import {searchGoogleLeads} from '../src/services/extractionService';
test('display helpers never synthesize missing phone or Instagram',()=>{
 assert.equal(resolveInstagram({name:'Loja Fixture'}).handle,'');
 const r=resolveWhatsAppNumber({name:'Loja Fixture'});assert.equal(r.cleanPhone,'');assert.equal(r.callUrl,'');assert.equal(r.sourcesFound.length,0);
 const phone=resolveWhatsAppNumber({name:'Fixture',phone:'(34) 3333-3333',confidence:100});assert.equal(phone.isVerifiedReal,false);
});
test('phone format, arbitrary confidence and CNPJ length do not prove a real/active contact',()=>{
 const c:any={name:'Fixture',phone:'(34) 3333-3333',location:'Uberlândia',profileUrl:'https://example.com',confidence:100,cnpj:'12345678901234',legalSource:'Receita Federal'};
 assert.equal(auditContactVeracity(c).isReal,false);
 c.evidence={name:{value:'Fixture',sourceUrl:'https://example.com',source:'Fixture',retrievedAt:new Date().toISOString(),excerpt:'Fixture'}};
 assert.equal(auditContactVeracity(c).isReal,true);assert.match(auditContactVeracity(c).reason,/Não comprova telefone ativo/);
 c.name='Changed';assert.equal(auditContactVeracity(c).isReal,false);
});
test('frontend requires login and does not create fallback contacts',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async()=>({ok:false,status:503,json:async()=>({error:'Provider unavailable'})}) as any;
 try {await assert.rejects(searchGoogleLeads('eletrodomésticos','Uberlândia'),/Entre no aplicativo/);} finally {globalThis.fetch=original;}
});
