import test from 'node:test';
import assert from 'node:assert/strict';
import { mutateCrm, contactIdentity } from '../src/server/crm.js';
import handler from '../api/crm.js';

function database() {
  const records = new Map();
  const collection = path => ({
    doc: id => reference(`${path}/${id}`),
    where: (field, _operator, value) => ({limit: () => ({path, field, value, isQuery:true})}),
  });
  const reference = path => ({path, id:path.split('/').at(-1), collection: child => collection(`${path}/${child}`)});
  const snapshot = ref => ({exists:records.has(ref.path), ref, data:() => records.get(ref.path)});
  return {
    records, collection,
    runTransaction: async operation => {
      const writes = [];
      const value = await operation({
        get: async ref => {
          assert.equal(writes.length, 0, 'All reads must precede writes');
          if (!ref.isQuery) return snapshot(ref);
          const docs = [...records].filter(([path, value]) => path.startsWith(ref.path + '/') && value[ref.field] === ref.value)
            .slice(0,1).map(([path]) => snapshot(reference(path)));
          return {empty:!docs.length, docs};
        },
        set: (ref, data) => writes.push([ref, data]),
      });
      for (const [ref, data] of writes) records.set(ref.path, {...records.get(ref.path), ...data});
      return value;
    },
  };
}
const contact = {name:'Empresa teste', profileUrl:'https://example.test/planta', phone:'', status:'new'};

test('CRM endpoint rejects unauthenticated mutations', async () => {
  const res = {setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
  await handler({method:'POST',headers:{},body:{action:'saveContacts',contacts:[contact]}},res);
  assert.equal(res.code,401);
});
test('CRM isolates owner, retries without duplication and preserves CRM status and notes', async () => {
  const db = database();
  const body = {action:'saveContacts',userId:'victim',contacts:[contact,contact]};
  const first = await mutateCrm(body,{userId:'owner',db});
  const path = `users/owner/contacts/${first.ids[0]}`;
  db.records.set(path,{...db.records.get(path),status:'qualified',notes:'Anotação do vendedor'});
  await mutateCrm({...body,contacts:[{...contact,phone:'(34) 3333-3333'}]},{userId:'owner',db});
  assert.equal(db.records.size,1);
  assert.equal(db.records.get(path).status,'qualified');
  assert.equal(db.records.get(path).notes,'Anotação do vendedor');
  assert.equal(db.records.get(path).phone,'(34) 3333-3333');
  assert.equal(first.ids.length,1);
});
test('CRM reuses legacy IDs and ignores client ownership and timestamps', async () => {
  const db = database();
  db.records.set('users/owner/contacts/legacy',{...contact,createdAt:123});
  const result = await mutateCrm({action:'saveContacts',contacts:[{...contact,id:'victim',createdAt:999,userId:'victim'}]}, {userId:'owner',db});
  assert.deepEqual(result.ids,['legacy']);
  const stored = db.records.get('users/owner/contacts/legacy');
  assert.equal(stored.createdAt,123);
  assert.equal(stored.userId,undefined);
  assert.equal(stored.id,undefined);
});
test('CRM validates operation, record size, path and persistent storage', async () => {
  const db = database();
  for (const body of [
    {action:'deleteContacts',ids:['../../victim']},
    {action:'saveContacts',contacts:[]},
    {action:'saveContacts',contacts:[{name:'A',status:'invented'}]},
    {action:'saveContacts',contacts:[{name:'A',notes:'x'.repeat(60001)}]},
    {action:'unknown'},
  ]) await assert.rejects(mutateCrm(body,{userId:'owner',db}));
  await assert.rejects(mutateCrm({},{userId:'owner',db:null}),error => error.status===503);
});
test('identity keeps separate plants and authors while discarding tracking parameters', () => {
  assert.equal(contactIdentity(contact),contactIdentity({...contact,profileUrl:contact.profileUrl+'?utm_source=ad'}));
  assert.notEqual(contactIdentity(contact),contactIdentity({...contact,profileUrl:'https://example.test/outra-planta'}));
  const mention = {...contact,recordType:'purchase_mention',authorProfileUrl:'https://social.test/one'};
  assert.notEqual(contactIdentity(mention),contactIdentity({...mention,authorProfileUrl:'https://social.test/two'}));
});
