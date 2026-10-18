const { test } = require('node:test');
const assert = require('node:assert/strict');
const { assertDisposable } = require('./e2e-safety.cjs');
const safe = {
  NODE_ENV: 'test', ALLOW_DISPOSABLE_E2E: '1',
  DATABASE_URL: 'postgres://postgres@127.0.0.1:55439/civicconnect_test',
  BASE_URL: 'http://127.0.0.1:3301', E2E_BASE_URL: 'http://127.0.0.1:4174',
};
test('e2e permits explicitly opted-in loopback disposable targets', () => assert.doesNotThrow(() => assertDisposable(safe, true)));
for (const [key, value] of [
  ['NODE_ENV','production'], ['ALLOW_DISPOSABLE_E2E','0'],
  ['DATABASE_URL','postgres://postgres@127.0.0.1/civicconnect_local_review'],
  ['DATABASE_URL','postgres://postgres@db.example.test/civicconnect_test'],
  ['DATABASE_URL','https://127.0.0.1/civicconnect_test'],
  ['BASE_URL','https://example.test'], ['BASE_URL','http://user:password@127.0.0.1'],
  ['E2E_BASE_URL','http://127.0.0.1/api'], ['E2E_BASE_URL',undefined],
]) test(`e2e refuses unsafe or missing ${key}: ${value}`, () => assert.throws(() => assertDisposable({ ...safe, [key]: value }, true)));
