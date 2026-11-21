import test from 'node:test';
import assert from 'node:assert/strict';
import { getSalesScriptsForContact, OBJECTION_HANDBOOK } from '../src/utils/salesScripts';
import type { Contact } from '../src/types';

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
