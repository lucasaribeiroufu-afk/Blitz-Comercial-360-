import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

// Exercise actual Firebase Admin imports without Node's require(ESM) bridge.
// Previously both entrypoints crashed in jwks-rsa -> jose before handling a request.
for (const route of ['deep-search', 'b2c-multifactor-search']) {
  test(`${route} loads without require(ESM) and rejects missing/invalid Firebase sessions`, () => {
    const script = `
      const {default: handler} = await import('./api/${route}.js');
      for (const authorization of ['', 'Bearer not-a-jwt']) {
        const res = {
          statusCode: 200, headers: {},
          setHeader(name, value) { this.headers[name] = value; },
          status(code) { this.statusCode = code; return this; },
          json(body) { this.body = body; return this; }
        };
        await handler({method: 'POST', headers: {authorization}, body: {
          query: 'lojas de tintas', location: 'Uberlândia, MG', count: 4
        }}, res);
        if (res.statusCode !== 401 || typeof res.body?.error !== 'string' || 'leads' in res.body) {
          throw new Error('Authentication failure must remain an explicit 401 JSON error');
        }
      }
      console.log('authenticated entrypoint ready; unauthorized requests rejected');
    `;
    const result = spawnSync(process.execPath, [
      '--no-experimental-require-module', '--input-type=module', '--eval', script,
    ], {cwd: new URL('..', import.meta.url), encoding: 'utf8', timeout: 15000});
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /unauthorized requests rejected/);
  });
}
