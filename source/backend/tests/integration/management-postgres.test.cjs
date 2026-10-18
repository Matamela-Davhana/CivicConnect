const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { randomUUID } = require('node:crypto');
const jwt = require('jsonwebtoken');

test('management aggregates against PostgreSQL in temporary fixture tables', { timeout: 30000 }, async (t) => {
  assert.ok(process.env.DATABASE_URL, 'Set a local test DATABASE_URL');
  const target = new URL(process.env.DATABASE_URL);
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(target.hostname));
  assert.ok(['/civicconnect_test', '/civicconnect_local_review'].includes(target.pathname));
  assert.ok(process.env.JWT_SECRET);
  const db = require('../../db');
  db.options.connectionTimeoutMillis = 5000;
  const originalQuery = db.query;
  let client;
  let server;
  t.after(async () => {
    try {
      if (server) await new Promise((resolve) => server.close(resolve));
      if (client) {
        await client.query('ROLLBACK');
        assert.equal((await client.query("SELECT to_regclass('pg_temp.service_requests') AS relation")).rows[0].relation, null);
      }
    } finally {
      db.query = originalQuery;
      if (client) client.release();
      await db.end();
    }
  });
  client = await db.connect();
  await client.query('BEGIN');
  await client.query("SET LOCAL statement_timeout = '5s'");
  await client.query("SET LOCAL TIME ZONE 'Pacific/Honolulu'");
  // Real SQL and production column types, isolated to this connection. Temporary
  // tables shadow public tables so empty/boundary cases never delete or alter user data.
  // This verifies aggregates, not production constraints or login credentials.
  await client.query('CREATE TEMP TABLE categories (LIKE public.categories INCLUDING DEFAULTS) ON COMMIT DROP');
  await client.query('CREATE TEMP TABLE service_requests (LIKE public.service_requests INCLUDING DEFAULTS) ON COMMIT DROP');
  db.query = (...args) => client.query(...args);
  server = require('../../server').listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api/management/summary`;
  const read = async (role = 'management', suffix = '') => {
    const response = await fetch(base + suffix, { headers: { Authorization: `Bearer ${jwt.sign({ id: randomUUID(), role }, process.env.JWT_SECRET)}` } });
    assert.equal(response.status, role === 'management' ? 200 : 403);
    return response.json();
  };
  await t.test('empty dataset returns numeric zero totals and empty breakdowns', async () => {
    assert.deepEqual(await read(), { open: 0, overdue: 0, completed: 0, byStatus: [], byCategory: [] });
  });
  const categories = [randomUUID(), randomUUID()];
  await client.query("INSERT INTO pg_temp.categories (id,name,active) VALUES ($1,'Alpha',true),($2,'Zulu disabled',false)", categories);
  const states = ['submitted', 'accepted', 'assigned', 'in_progress', 'on_hold', 'resolved', 'closed', 'rejected', 'assigned', 'in_progress'];
  const offsets = [null, -1, 0, 1, -1, -1, -1, -1, null, -1];
  const ids = states.map(() => randomUUID());
  for (const [index, status] of states.entries()) {
    await client.query(`INSERT INTO pg_temp.service_requests
      (id,reference,category_id,status,description,other_explanation,requester_id,assignee_id,target_resolution_date)
      VALUES ($1,$2,$3,$4,'SENSITIVE description','SENSITIVE explanation',$5,$6,
        CASE WHEN $7::int IS NULL THEN NULL ELSE (CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Johannesburg')::date + $7::int END)`,
    [ids[index], `PRIVATE-${index}`, categories[index < 5 ? 0 : 1], status, randomUUID(), randomUUID(), offsets[index]]);
  }
  await t.test('every lifecycle state is counted once, with rejected outside open/completed totals', async () => {
    const summary = await read();
    assert.equal(summary.open, 7);
    assert.equal(summary.completed, 2);
    assert.deepEqual(summary.byStatus, [
      { status: 'submitted', count: 1 }, { status: 'accepted', count: 1 },
      { status: 'assigned', count: 2 }, { status: 'in_progress', count: 2 },
      { status: 'on_hold', count: 1 }, { status: 'resolved', count: 1 },
      { status: 'closed', count: 1 }, { status: 'rejected', count: 1 },
    ]);
    assert.equal(summary.byStatus.reduce((sum, r) => sum + r.count, 0), 10);
  });
  await t.test('overdue excludes today, future, absent dates and terminal states, independent of database session timezone', async () => {
    assert.equal((await read()).overdue, 3);
    const today = (await client.query("SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Johannesburg')::date::text AS day")).rows[0].day;
    const dueToday = (await client.query('SELECT target_resolution_date::text AS day FROM service_requests WHERE id=$1', [ids[2]])).rows[0].day;
    assert.equal(dueToday, today);
    // Move just the due-today open request to yesterday: exactly one extra overdue.
    await client.query('UPDATE pg_temp.service_requests SET target_resolution_date=target_resolution_date-1 WHERE id=$1', [ids[2]]);
    assert.equal((await read()).overdue, 4);
    await client.query('UPDATE pg_temp.service_requests SET target_resolution_date=target_resolution_date+1 WHERE id=$1', [ids[2]]);
  });
  await t.test('category totals include historical requests in inactive categories and agree with status totals', async () => {
    const summary = await read();
    assert.deepEqual(summary.byCategory, [{ category: 'Alpha', count: 5 }, { category: 'Zulu disabled', count: 5 }]);
    assert.equal(summary.byCategory.reduce((sum, r) => sum + r.count, 0), summary.byStatus.reduce((sum, r) => sum + r.count, 0));
  });
  await t.test('only aggregate keys are returned, regardless of client-supplied identity/include filters', async () => {
    const summary = await read('management', '?requester_id=anything&include=internal&role=admin');
    assert.deepEqual(Object.keys(summary).sort(), ['byCategory', 'byStatus', 'completed', 'open', 'overdue']);
    for (const row of summary.byStatus) assert.deepEqual(Object.keys(row).sort(), ['count', 'status']);
    for (const row of summary.byCategory) assert.deepEqual(Object.keys(row).sort(), ['category', 'count']);
    assert.doesNotMatch(JSON.stringify(summary), /SENSITIVE|PRIVATE|requester|assignee|description|timeline|email|password|content|internal/);
    for (const role of ['requester', 'staff', 'admin']) await read(role);
  });
  await t.test('refresh reflects a status change without double-counting', async () => {
    await client.query("UPDATE pg_temp.service_requests SET status='resolved' WHERE id=$1", [ids[1]]);
    const summary = await read();
    assert.equal(summary.open, 6);
    assert.equal(summary.completed, 3);
    assert.equal(summary.overdue, 2);
    assert.equal(summary.byStatus.reduce((sum, row) => sum + row.count, 0), 10);
  });
  await t.test('rejected-only records still produce a breakdown and zero open/completed/overdue', async () => {
    await client.query("UPDATE pg_temp.service_requests SET status='rejected'");
    const summary = await read();
    assert.equal(summary.open, 0);
    assert.equal(summary.overdue, 0);
    assert.equal(summary.completed, 0);
    assert.deepEqual(summary.byStatus, [{ status: 'rejected', count: 10 }]);
  });
});
