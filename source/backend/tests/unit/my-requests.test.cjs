const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const jwt = require('jsonwebtoken');

test('My Requests HTTP contract (database stub, not PostgreSQL evidence)', async (t) => {
  const dbPath = require.resolve('../../db');
  const previousDb = require.cache[dbPath];
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'disposable-my-requests-contract-test-only';
  let calls = 0;
  let fail = false;
  const row = { id: 'request-a', reference: 'CC-A', category: 'IT Support', status: 'submitted',
    createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-02T00:00:00.000Z' };
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
    async query(sql, params) {
      calls++;
      assert.match(sql, /WHERE r.requester_id = \$1/);
      assert.match(sql, /e.entry_type = 'public'/);
      assert.match(sql, /ORDER BY r.submitted_at DESC, r.id DESC/);
      assert.equal(params.length, 1);
      if (fail) throw new Error('Private database diagnostic');
      return { rows: params[0] === 'owner-a' ? [row] : [] };
    },
  } };
  let server;
  t.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (previousDb) require.cache[dbPath] = previousDb;
    else delete require.cache[dbPath];
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  });
  server = require('../../server').listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}/api/requests/mine`;
  const request = (role = 'requester', id = 'owner-a', suffix = '') => {
    const headers = role ? { Authorization: `Bearer ${jwt.sign({ id, role }, process.env.JWT_SECRET)}` } : {};
    return fetch(url + suffix, { headers });
  };
  await t.test('literal /mine route returns the frontend fields', async () => {
    const response = await request();
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), [row]);
  });
  await t.test('query-string owner cannot override the signed-in identity', async () => {
    const response = await request('requester', 'owner-b', '?requester_id=owner-a&userId=owner-a');
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), []);
  });
  for (const role of [null, 'staff', 'management', 'admin']) {
    await t.test(`${role || 'anonymous'} is rejected before querying the database`, async () => {
      const before = calls;
      const response = await request(role);
      assert.equal(response.status, role ? 403 : 401);
      assert.equal(calls, before);
    });
  }
  await t.test('database failures return safe JSON for the frontend retry state', async () => {
    fail = true;
    const response = await request();
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { message: 'Could not load your requests. Please try again.' });
  });
});
