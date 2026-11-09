import assert from 'node:assert/strict';
import test from 'node:test';
import { createQuoteHandler } from '../src/server/quoteRequests.js';
import { SearchError } from '../src/server/verifiedSearch.js';

test('public quotes qualify against private offers and write once to the owner’s CRM', async () => {
  const records = new Map();
  const collection = path => ({
    doc: id => ({
      id,
      path: path + '/' + id,
      collection: child => collection(path + '/' + id + '/' + child),
      get: async () => snapshot(path + '/' + id),
    }),
    where: () => ({ limit: () => ({ size: 0 }) }),
  });
  const snapshot = path => ({ exists: records.has(path), data: () => records.get(path) });
  const db = {
    collection,
    runTransaction: operation => operation({
      get: async ref => ref.path ? snapshot(ref.path) : ref,
      set: (ref, value) => records.set(ref.path, value),
      update: (ref, value) => records.set(ref.path, { ...records.get(ref.path), ...value }),
    }),
  };
  const handler = createQuoteHandler({
    getDb: () => db,
    authenticate: async req => {
      if (!req.owner) throw new SearchError('Login obrigatório.', 401);
      return req.owner;
    },
  });
  const call = async (body, owner) => {
    let status, data;
    await handler({ method: 'POST', body, owner }, {
      setHeader() {},
      status(value) { status = value; return this; },
      json(value) { data = value; },
    });
    return { status, data };
  };
  assert.equal((await call({ action: 'save' })).status, 401);
  const offer = await call({ action: 'save', product: 'Tinta térmica', seller: 'Fornecedor', stock: 10, prefixes: '38' }, 'seller');
  assert.equal(offer.status, 200);
  const { id } = offer.data;
  assert.deepEqual((await call({ action: 'read', id })).data, { product: 'Tinta térmica', seller: 'Fornecedor' });
  assert.equal((await call({ action: 'disable', id }, 'other')).status, 404);
  const quote = { action: 'request', id, name: 'Comprador teste', city: 'Uberlândia/MG', cep: '38400-100', quantity: 5, channel: 'email', contact: 'buyer@example.test', consent: true };
  assert.equal((await call({ ...quote, consent: false })).status, 422);
  assert.equal((await call({ ...quote, cep: '01000-100' })).status, 409);
  assert.equal((await call({ ...quote, quantity: 11 })).status, 409);
  assert.equal((await call(quote)).status, 200);
  assert.equal((await call(quote)).status, 200);
  const leads = [...records.entries()].filter(([path]) => path.startsWith('users/'));
  assert.equal(leads.length, 1);
  assert.match(leads[0][0], /^users\/seller\/contacts\/quote-/);
  assert.equal(leads[0][1].email, quote.contact);
  assert.equal((await call({ action: 'disable', id }, 'seller')).status, 200);
  assert.equal((await call(quote)).status, 404);
});
