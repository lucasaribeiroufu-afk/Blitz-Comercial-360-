import test from 'node:test';
import assert from 'node:assert/strict';
import {readApiResponse} from '../src/services/apiResponse';

const route = '/api/deep-search';
test('HTML failures expose route, HTTP status and content type, never a fallback list', async () => {
  for (const status of [200, 404, 500]) {
    await assert.rejects(readApiResponse(new Response('<!doctype html><html>private fixture</html>', {
      status, headers: {'Content-Type': 'text/html; charset=utf-8'},
    }), route), (error: Error) => {
      assert.match(error.message, /\/api\/deep-search/);
      assert.ok(error.message.includes(`HTTP ${status}`));
      assert.match(error.message, /Content-Type: text\/html/);
      assert.match(error.message, /HTML/);
      assert.ok(!error.message.includes('private fixture'));
      return true;
    });
  }
});
test('Vercel invocation errors preserve safe platform codes without raw body', async () => {
  await assert.rejects(readApiResponse(new Response('FUNCTION_INVOCATION_FAILED\nfixture-secret', {
    status: 500, headers: {'Content-Type': 'text/plain'},
  }), route), (error: Error) => {
    assert.match(error.message, /HTTP 500.*text\/plain.*FUNCTION_INVOCATION_FAILED/);
    assert.ok(!error.message.includes('fixture-secret'));
    return true;
  });
});
test('JSON auth and provider errors remain errors, and successful data is preserved', async () => {
  for (const [status, error] of [[401, 'Entre no aplicativo'], [503, 'Configure GOOGLE_MAPS_API_KEY']] as const) {
    await assert.rejects(readApiResponse(Response.json({error}, {status}), route), new RegExp(`HTTP ${status}.*${error}`));
  }
  const result = {leads: [{name: 'Source fixture'}], meta: {returnedCount: 1}};
  assert.deepEqual(await readApiResponse(Response.json(result), route), result);
});
test('invalid JSON and unexpected JSON values cannot masquerade as successful search data', async () => {
  await assert.rejects(readApiResponse(new Response('{', {headers: {'Content-Type': 'application/json'}}), route), /JSON válido/);
  for (const value of [null, [], 'invalid']) {
    await assert.rejects(readApiResponse(Response.json(value), route), /formato inesperado/);
  }
});
