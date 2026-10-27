import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/deep-search.js';

test('B2B serverless entrypoint loads and preserves authentication and JSON errors', async () => {
  for (const [method, expected] of [['POST', 401], ['GET', 405]]) {
    const res = {
      headers: {}, code: 200, body: undefined,
      setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
      status(code) { this.code = code; return this; },
      json(body) { this.headers['content-type'] = 'application/json'; this.body = body; return this; },
    };
    await handler({method, headers: {}, body: {query: 'lojas de tintas', location: 'Uberlândia, MG', count: 4, targetEntityType: 'pj'}}, res);
    assert.equal(res.code, expected);
    assert.equal(res.headers['content-type'], 'application/json');
    assert.equal(res.headers['cache-control'], 'no-store');
    assert.equal(typeof res.body.error, 'string');
    assert.equal(res.body.leads, undefined);
  }
});
