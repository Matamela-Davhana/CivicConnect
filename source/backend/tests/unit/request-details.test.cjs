const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const jwt = require('jsonwebtoken');

test('request details HTTP contract (database stub)', async (t) => {
  const requestId = '11111111-1111-4111-8111-111111111111';
  const missingId = '22222222-2222-4222-8222-222222222222';
  const owner = '33333333-3333-4333-8333-333333333333';
  const other = '44444444-4444-4444-8444-444444444444';
  const dbPath = require.resolve('../../db');
  const previousDb = require.cache[dbPath];
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'disposable-details-contract-only';
  let queries = 0;
  let fail = '';
  const row = { id: requestId, reference: 'REQ-001', category: 'IT Support', status: 'submitted',
    description: 'Laptop not booting', otherExplanation: null, createdAt: '2026-10-01T00:00:00.000Z',
    targetDate: '2026-10-20', requesterId: owner, requesterName: 'Owner', assigneeId: other, assigneeName: 'Staff' };
  const events = [
    { id: 'history-1', visibility: 'public', author: 'Owner', message: 'Request submitted.', createdAt: row.createdAt },
    { id: 'entry-1', visibility: 'public', author: 'Staff', message: 'Acknowledged', createdAt: row.createdAt },
    { id: 'entry-2', visibility: 'internal', author: 'Staff', message: 'PRIVATE NOTE', createdAt: row.createdAt },
  ];
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
    async query(sql, params) {
      queries++;
      if (sql.includes('FROM service_requests r')) {
        assert.match(sql, /WHERE r.id = \$1 AND \(\$2::boolean OR r.requester_id = \$3::uuid\)/);
        if (fail === 'detail') throw new Error('Private diagnostic');
        return { rows: params[0] === requestId && (params[1] || params[2] === owner) ? [row] : [] };
      }
      assert.match(sql, /e.entry_type = 'public'/);
      assert.match(sql, /ORDER BY "createdAt" ASC, event_order ASC, id ASC/);
      assert.equal(params[0], requestId);
      if (fail === 'timeline') throw new Error('Private diagnostic');
      return { rows: events.filter((entry) => params[1] || entry.visibility === 'public') };
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
  const base = `http://127.0.0.1:${server.address().port}/api/requests/`;
  const get = (role = 'requester', userId = owner, id = requestId) => fetch(base + id, {
    headers: role ? { Authorization: `Bearer ${jwt.sign({ id: userId, role }, process.env.JWT_SECRET)}` } : {},
  });
  await t.test('owner receives frontend fields and only public timeline entries', async () => {
    const response = await get();
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { id: row.id, reference: row.reference, category: row.category,
      status: row.status, description: row.description, otherExplanation: null, createdAt: row.createdAt,
      targetDate: row.targetDate, timeline: events.slice(0, 2) });
  });
  await t.test('staff receives internal entries and minimal requester/assignee identity', async () => {
    const response = await get('staff', other);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.deepEqual(payload.timeline, events);
    assert.deepEqual(payload.requester, { id: owner, name: 'Owner' });
    assert.deepEqual(payload.assignee, { id: other, name: 'Staff' });
  });
  for (const role of [null, 'management', 'admin', 'unknown']) {
    await t.test(`${role || 'anonymous'} cannot read details or query the database`, async () => {
      const before = queries;
      assert.equal((await get(role)).status, role ? 403 : 401);
      assert.equal(queries, before);
    });
  }
  await t.test('other owner and nonexistent request return identical 404s without timeline queries', async () => {
    const before = queries;
    const hidden = await get('requester', other);
    const missing = await get('requester', owner, missingId);
    assert.equal(hidden.status, 404);
    assert.equal(missing.status, 404);
    assert.deepEqual(await hidden.json(), await missing.json());
    assert.equal(queries - before, 2);
  });
  await t.test('malformed IDs return not-found without invoking PostgreSQL', async () => {
    const before = queries;
    const response = await get('requester', owner, 'not-a-uuid');
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { message: 'Request not found.' });
    assert.equal(queries, before);
  });
  await t.test('query parameters cannot override owner or grant staff visibility', async () => {
    const response = await get('requester', other, `${requestId}?requester_id=${owner}&role=staff`);
    assert.equal(response.status, 404);
  });
  for (const phase of ['detail', 'timeline']) {
    await t.test(`${phase} database failure returns safe JSON`, async () => {
      fail = phase;
      const response = await get();
      assert.equal(response.status, 500);
      assert.deepEqual(await response.json(), { message: 'Could not load this request. Please try again.' });
      fail = '';
    });
  }
});
