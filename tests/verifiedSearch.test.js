import test from 'node:test';
import assert from 'node:assert/strict';
import {searchBusinesses,searchBuyers,extractWebsite,cnpjLookup,validCnpj,publicIp,matchesLocation,makeHandler,readPublicPage,buyerExcerpt} from '../src/server/verifiedSearch.js';
const response = data => ({ok:true,json:async()=>data});
const place = (overrides={}) => ({id:'fixture-place',displayName:{text:'Loja de Eletrodomésticos'},primaryTypeDisplayName:{text:'Loja de eletrodomésticos'},formattedAddress:'Uberlândia, MG',addressComponents:[{types:['administrative_area_level_2'],longText:'Uberlândia'},{types:['administrative_area_level_1'],shortText:'MG'}],...overrides});
test('B2B never substitutes a gas station and respects exact municipality',async()=>{
 const result=await searchBusinesses({query:'eletrodomésticos',location:'Uberlândia - MG',count:10},{mapsKey:'fixture',fetcher:async()=>response({places:[place(),place({id:'other',displayName:{text:'Posto de Gasolina'},primaryTypeDisplayName:{text:'Posto de combustível'}}),place({id:'wrong-city',addressComponents:[{types:['locality'],longText:'Uberaba'},{types:['administrative_area_level_1'],shortText:'MG'}]})]})});
 assert.equal(result.leads.length,1);const lead=result.leads[0];
 assert.equal(lead.phone,'');assert.equal(lead.instagram,'');assert.equal(lead.whatsapp,'');assert.equal(lead.decisionMaker,'');assert.equal(lead.rating,undefined);assert.equal(lead.demandTimeframe,'');assert.equal(lead.confidence,undefined);
 assert.equal(lead.evidence.name.value,lead.name); assert.ok(lead.evidence.name.sourceUrl.startsWith('https://')); assert.ok(Date.parse(lead.evidence.name.retrievedAt));
});
test('provider failure and missing keys are explicit; no fallback database',async()=>{
 await assert.rejects(searchBusinesses({query:'lojas'},{mapsKey:''}),/GOOGLE_MAPS_API_KEY/);
 await assert.rejects(searchBusinesses({query:'lojas'},{mapsKey:'fixture',fetcher:async()=>({ok:false,status:403})}),/HTTP 403/);
 await assert.rejects(searchBuyers({query:'geladeira'},{serperKey:''}),/SERPER_API_KEY/);
});
test('empty, quantity, exclusions and pagination are honest',async()=>{
 const fetcher=async()=>response({places:[place()]});
 assert.equal((await searchBusinesses({query:'eletrodomésticos',excludeNames:['Loja de Eletrodomésticos']},{mapsKey:'fixture',fetcher})).leads.length,0);
 assert.equal((await searchBusinesses({query:'eletrodomésticos',offset:1},{mapsKey:'fixture',fetcher})).leads.length,0);
 await assert.rejects(searchBusinesses({query:'x',count:-1}),/Quantidade/);
 assert.match((await searchBusinesses({query:'x',location:'Uberaba-MG'},{mapsKey:'fixture',fetcher})).meta.summary,/Nenhum resultado auditado/);
});
test('B2C snippets cannot create a buyer, phone, publication date or identity',async()=>{
 const fetcher=async()=>response({organic:[{link:'https://example.com/1',snippet:'Quero comprar geladeira em Uberlândia MG',date:'2026-10-13'},{link:'https://example.com/2'}]});
 const r=await searchBuyers({query:'geladeira',location:'Uberlândia MG'},{serperKey:'fixture',fetcher,readPage:async url=>({url,html:url.endsWith('1')?'<title>Fórum</title><p>Quero comprar geladeira em Uberlândia MG.</p><footer>Telefone da administração: 34999999999</footer>':'<title>Loja</title><p>Compre agora geladeira em Uberlândia MG</p>'})});
 assert.equal(r.leads.length,1);const lead=r.leads[0];assert.equal(lead.name,'Fórum');assert.equal(lead.recordType,'purchase_mention');assert.equal(lead.phone,'');assert.equal(lead.date,undefined);assert.equal(lead.entityType,undefined);assert.equal(lead.location,'');assert.equal(lead.rating,undefined);assert.equal(lead.intent,lead.evidence.intent.excerpt);
 const no=await searchBuyers({query:'geladeira'},{serperKey:'fixture',fetcher,readPage:async url=>({url,html:'<title>Sem evidência</title><p>Bem-vindo ao fórum.</p>'})});assert.equal(no.leads.length,0);
});
test('B2C rejects blocked sources and unrelated geography without national fallback',async()=>{
 const fetcher=async()=>response({organic:[{link:'https://example.com/blocked'}]});
 const r=await searchBuyers({query:'geladeira',location:'Uberlândia'},{serperKey:'fixture',fetcher,readPage:async()=>{throw Error('403')}});
 assert.equal(r.leads.length,0);assert.ok(r.meta.warnings.some(w=>w.includes('não verificável')));
 assert.equal(buyerExcerpt('Quero comprar geladeira em Uberaba','geladeira','Uberlândia'),'');
});
test('URL extraction never generates contacts; JSON-LD scopes organization phone',async()=>{
 const r=await extractWebsite({url:'https://example.com'},{readPage:async url=>({url,html:'<title>Página</title><footer>Telefone de terceiro: 34999999999</footer>'})});assert.equal(r.lead.phone,'');assert.equal(r.lead.name,'Página');assert.equal(r.lead.location,'');
 const html='<title>Loja</title><script type="application/ld+json">{"@type":"Organization","name":"Loja Fixture","telephone":"(34) 3333-3333","email":"fixture@example.com"}</script>';
 const org=await extractWebsite({url:'https://example.com'},{readPage:async url=>({url,html})});assert.equal(org.lead.phone,'(34) 3333-3333');assert.equal(org.lead.evidence.phone.value,org.lead.phone);assert.equal(org.lead.decisionMakerPhone,'');assert.equal(org.lead.whatsapp,'');
});
test('CNPJ check digits and response identity, no invented rating or duplicated DDD',async()=>{
 assert.equal(validCnpj('11.222.333/0001-81'),true);assert.equal(validCnpj('11.222.333/0001-82'),false);
 const r=await cnpjLookup('11.222.333/0001-81',{fetcher:async()=>response({cnpj:'11222333000181',razao_social:'Fixture LTDA',ddd_telefone_1:'3433333333',municipio:'Uberlândia',uf:'MG',qsa:[]})});
 assert.equal(r.phone,'3433333333');assert.equal(r.rating,undefined);assert.equal(r.decisionMaker,'');
 await assert.rejects(cnpjLookup('11222333000181',{fetcher:async()=>response({cnpj:'other',razao_social:'Other'})}),/incompatível/);
});
test('location matching cannot replace SP with MG or expand a municipality',()=>{
 assert.ok(matchesLocation(place(),'Uberlândia - MG'));assert.ok(matchesLocation(place(),'Uberlândia MG'));assert.equal(matchesLocation(place(),'Uberlândia-SP'),false);assert.equal(matchesLocation(place(),'Uberaba'),false);
});
test('public scraper blocks SSRF, credentials, HTTP and private addresses',async()=>{
 for (const ip of ['127.0.0.1','10.0.0.1','172.16.0.1','192.168.1.1','169.254.169.254','::1','::ffff:127.0.0.1','fc00::1','fe80::1']) assert.equal(publicIp(ip),false,ip);
 assert.equal(publicIp('8.8.8.8'),true);
 for (const url of ['http://example.com','https://user:pass@example.com','https://127.0.0.1','https://[::1]','https://example.com:8443']) await assert.rejects(readPublicPage(url));
});
test('handlers return actionable status and no provider credentials',async()=>{
 const res={code:0,body:null,setHeader(){},status(n){this.code=n;return this},json(body){this.body=body;return this}};
 await makeHandler(searchBusinesses)({method:'POST',body:{query:''}},res);assert.equal(res.code,400);assert.ok(res.body.error);
 await makeHandler(async()=>{throw Error('secret-key')})({method:'POST'},res);assert.equal(res.code,502);assert.ok(!res.body.error.includes('secret-key'));
});
