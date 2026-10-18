const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const jwt = require('jsonwebtoken');
const { SUMMARY_SQL } = require('../../services/management-summary');

test('management summary HTTP contract (database stub)', async (t) => {
  require('../helpers/stub-account-sessions.cjs').stubAccountSessions(t);
  const dbPath = require.resolve('../../db');
  const previousDb = require.cache[dbPath];
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'disposable-management-contract-only';
  const summary = { open: 5, overdue: 2, completed: 2,
    byStatus: [{ status: 'submitted', count: 5 }, { status: 'resolved', count: 1 }, { status: 'closed', count: 1 }],
    byCategory: [{ category: 'Other', count: 7 }] };
  const calls = [];
  let fail = false;
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
    async query(sql) {
      calls.push(sql);
      if (fail) throw new Error('Private connection diagnostic');
      return { rows: sql === SUMMARY_SQL ? [{ summary }] : [{ status: 'submitted', count: '5' }] };
    },
  } };
  const server = require('../../server').listen(0, '127.0.0.1');
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    if (previousDb) require.cache[dbPath] = previousDb; else delete require.cache[dbPath];
    if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret;
  });
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api/management`;
  const get = (path = '/summary', role = 'management') => fetch(base + path, { headers: role ? {
    Authorization: `Bearer ${jwt.sign({ id: '11111111-1111-4111-8111-111111111111', role }, process.env.JWT_SECRET)}`,
  } : {} });
  await t.test('returns numeric aggregate fields and breakdowns using one SQL statement', async () => {
    const response = await get();
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), summary);
    assert.deepEqual(calls, [SUMMARY_SQL]);
    assert.doesNotMatch(SUMMARY_SQL, /requester|assignee|description|request_entries|password|email|JOIN users|SELECT \*/i);
    assert.match(SUMMARY_SQL, /AT TIME ZONE 'Africa\/Johannesburg'/);
    assert.match(SUMMARY_SQL, /target_resolution_date </);
    assert.doesNotMatch(SUMMARY_SQL, /c\.active/);
  });
  for (const role of [null, 'requester', 'staff', 'admin', 'unknown']) {
    await t.test(`${role || 'anonymous'} cannot access summary or legacy overview`, async () => {
      const before = calls.length;
      for (const path of ['/summary', '/overview']) assert.equal((await get(path, role)).status, role ? 403 : 401);
      assert.equal(calls.length, before);
    });
  }
  await t.test('query parameters cannot select identities or widen the response', async () => {
    const response = await get('/summary?role=admin&requester_id=anything&include=internal&status=closed');
    assert.deepEqual(await response.json(), summary);
    assert.equal(calls.at(-1), SUMMARY_SQL);
  });
  await t.test('legacy overview retains its aggregate-only contract', async () => {
    const response = await get('/overview');
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { summary: [{ status: 'submitted', count: '5' }] });
  });
  await t.test('database errors return safe retry messages on both routes', async () => {
    fail = true;
    for (const path of ['/summary', '/overview']) {
      const response = await get(path);
      assert.equal(response.status, 500);
      assert.deepEqual(await response.json(), { message: 'Could not load the management summary. Please try again.' });
    }
  });
});
