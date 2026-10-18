const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const express = require('express');
const jwt = require('jsonwebtoken');

test('real authentication middleware validates current account state (database stub)', async (t) => {
  const id = '11111111-1111-4111-8111-111111111111';
  const path = require.resolve('../../db');
  const oldDb = require.cache[path];
  const oldSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'disposable-session-test-only';
  let row = { id, role: 'staff', active: true, token_version: 0 };
  let fail = false;
  let calls = 0;
  require.cache[path] = { id: path, filename: path, loaded: true, exports: { async query(sql, params) {
    calls++;
    assert.equal(sql, 'SELECT id, role, active, token_version FROM users WHERE id=$1');
    assert.deepEqual(params, [id]);
    if (fail) throw new Error('Private diagnostic');
    return { rows: row ? [row] : [] };
  } } };
  const app = express();
  app.get('/private', require('../../middleware/auth')(), (req, res) => res.json(req.user));
  const server = app.listen(0, '127.0.0.1');
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    if (oldDb) require.cache[path] = oldDb; else delete require.cache[path];
    if (oldSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = oldSecret;
  });
  await once(server, 'listening');
  const token = (extra = {}, options = {}) => jwt.sign({ id, role: 'staff', tokenVersion: 0, ...extra }, process.env.JWT_SECRET, options);
  const get = (value = token(), scheme = 'Bearer') => fetch(`http://127.0.0.1:${server.address().port}/private`, { headers: { Authorization: `${scheme} ${value}` } });
  await t.test('active matching account may use the signed role', async () => {
    const response = await get();
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { id, role: 'staff', tokenVersion: 0 });
  });
  for (const [name, change] of [['deactivated', { active: false }], ['role changed', { role: 'requester' }], ['version revoked', { token_version: 1 }]]) {
    await t.test(`${name} invalidates an otherwise correctly signed token`, async () => {
      row = { id, role: 'staff', active: true, token_version: 0, ...change };
      assert.equal((await get()).status, 401);
    });
  }
  await t.test('reactivation does not resurrect a revoked token', async () => {
    row = { id, role: 'staff', active: true, token_version: 2 };
    assert.equal((await get()).status, 401);
    assert.equal((await get(token({ tokenVersion: 2 }))).status, 200);
  });
  await t.test('missing accounts are denied', async () => {
    row = null;
    assert.equal((await get()).status, 401);
  });
  await t.test('malformed/expired/unsupported tokens never query the database', async () => {
    const before = calls;
    for (const value of ['bad', token({ id: 'invalid-id' }), token({ tokenVersion: undefined }), token({ tokenVersion: -1 }), token({}, { expiresIn: -1 }), token({}, { algorithm: 'HS384' })]) {
      assert.equal((await get(value)).status, 401);
    }
    assert.equal((await get(token(), 'Basic')).status, 401);
    assert.equal(calls, before);
  });
  await t.test('database outage fails closed without leaking diagnostics', async () => {
    fail = true;
    const response = await get();
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { message: 'Could not verify your session. Please try again.' });
  });
});
