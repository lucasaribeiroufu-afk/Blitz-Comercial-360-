import test from 'node:test';
import assert from 'node:assert/strict';
import { getSalesScriptsForContact, OBJECTION_HANDBOOK } from '../src/utils/salesScripts';
import { hasPurchaseIntent } from '../src/utils/purchaseIntent';
import { withEditedEvidence } from '../src/utils/contactEdits';
import type { Contact, Provenance } from '../src/types';

test('commercial drafts retain requested product without inventing approved terms or past contact', () => {
  const contact = {name:'Empresa teste',company:'Frigorífico teste',matchedProduct:'revestimento antiderrapante',phone:''} as Contact;
  for (const script of getSalesScriptsForContact(contact,'Lucas')) {
    const text = script.generateText(contact,'Lucas');
    assert.match(text,/revestimento antiderrapante/);
    assert.match(text,/Frigorífico teste/);
    assert.doesNotMatch(text,/frete gr[aá]tis|pronta entrega|5%|8%|48h|laudo oficial|segurar a tabela|exclusiv/i);
  }
  for (const item of OBJECTION_HANDBOOK) assert.doesNotMatch(item.scriptResponse,/frete gr[aá]tis|pronta entrega|48h|5%|100% segurada/i);
});

test('saved companies and notes cannot turn into published buying intent', () => {
  assert.equal(hasPurchaseIntent('Objetivo: compradores. Demanda não comprovada.'), false);
  const intent = {recordType:'purchase_mention',intent:'Procuro revestimento antiderrapante',matchedProduct:'revestimento antiderrapante',publishedAt:'2026-11-21',evidence:{intent:{value:'Procuro revestimento antiderrapante',excerpt:'Procuro revestimento antiderrapante',sourceUrl:'https://example.test/pedido',source:'Fonte pública',retrievedAt:'2026-11-21T12:00:00Z'}}} as Provenance;
  assert.equal(hasPurchaseIntent(intent), true);
  assert.equal(hasPurchaseIntent({...intent,recordType:'potential_company'}), false);
  assert.equal(hasPurchaseIntent({...intent,evidence:{}}), false);
  assert.equal(hasPurchaseIntent({...intent,publishedAt:''}), false);
});

test('saving an unchanged contact retains sources and changing a field invalidates only its source', () => {
  const source = {value:'Empresa',sourceUrl:'https://example.test',source:'Site',retrievedAt:'2026-11-21',excerpt:'Empresa'};
  const contact = {name:'Empresa',evidence:{name:source,phone:{...source,value:'3433019903'}},professionalContacts:[]} as unknown as Contact;
  assert.deepEqual(withEditedEvidence(contact,{name:'Empresa',notes:'Revisão'}).evidence,contact.evidence);
  const changed = withEditedEvidence(contact,{phone:'34999999999'});
  assert.deepEqual(Object.keys(changed.evidence!),['name']);
  assert.equal(changed.professionalContacts,undefined);
});
