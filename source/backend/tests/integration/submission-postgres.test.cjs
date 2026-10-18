const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { randomUUID } = require('node:crypto');
const bcrypt = require('bcrypt');
const { submitRequest } = require('../../services/submit-request');

test('submission against PostgreSQL with rollback-only fixtures', { timeout: 30000 }, async (t) => {
  assert.ok(process.env.DATABASE_URL, 'Set a local test DATABASE_URL');
  const target = new URL(process.env.DATABASE_URL);
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(target.hostname));
  assert.ok(['/civicconnect_test', '/civicconnect_local_review'].includes(target.pathname));
  assert.ok(process.env.JWT_SECRET);
  const db = require('../../db');
  db.options.connectionTimeoutMillis = 5000;
  const originalQuery = db.query;
  const originalConnect = db.connect;
  const users = [randomUUID(), randomUUID()];
  const normalId = randomUUID();
  const inactiveId = randomUUID();
  let client;
  let server;
  let failHistory = false;
  t.after(async () => {
    try {
      if (server) await new Promise((resolve) => server.close(resolve));
      if (client) {
        await client.query('ROLLBACK');
        assert.equal((await client.query('SELECT id FROM users WHERE id=ANY($1::uuid[])', [users])).rows.length, 0);
        assert.equal((await client.query('SELECT id FROM categories WHERE id=ANY($1::uuid[])', [[normalId, inactiveId]])).rows.length, 0);
      }
    } finally {
      db.query = originalQuery;
      db.connect = originalConnect;
      if (client) client.release();
      await db.end();
    }
  });
  client = await db.connect();
  await client.query('BEGIN');
  await client.query("SET LOCAL statement_timeout = '5s'");
  db.query = (...args) => client.query(...args);
  // Keep real application SQL inside the fixture transaction. Transaction commands
  // become savepoints ONLY in this test; browser testing verifies durable commits.
  db.connect = async () => ({
    async query(sql, params) {
      if (sql === 'BEGIN') return client.query('SAVEPOINT submission_test');
      if (sql === 'COMMIT') return client.query('RELEASE SAVEPOINT submission_test');
      if (sql === 'ROLLBACK') {
        await client.query('ROLLBACK TO SAVEPOINT submission_test');
        return client.query('RELEASE SAVEPOINT submission_test');
      }
      if (failHistory && sql.includes('INSERT INTO status_history')) {
        return client.query('SELECT deliberately_missing_submission_test_column');
      }
      return client.query(sql, params);
    },
    release() {},
  });
  const password = randomUUID();
  const hash = await bcrypt.hash(password, 4);
  for (const id of users) {
    await client.query("INSERT INTO users (id,name,email,password_hash,role) VALUES ($1,'Submission fixture',$2,$3,'requester')",
      [id, `${id}@example.test`, hash]);
  }
  await client.query('INSERT INTO categories (id,name,active) VALUES ($1,$2,true),($3,$4,false)',
    [normalId, `Fixture-${normalId}`, inactiveId, `Inactive-${inactiveId}`]);
  const other = (await client.query("SELECT id FROM categories WHERE name='Other' AND active=true")).rows[0];
  assert.ok(other, 'The active Other category is required');
  server = require('../../server').listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const tokens = [];
  for (const id of users) {
    const response = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `${id}@example.test`, password }) });
    assert.equal(response.status, 200);
    tokens.push((await response.json()).token);
  }
  const headers = (index = 0) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${tokens[index]}` });
  const post = (body) => fetch(`${base}/requests`, { method: 'POST', headers: headers(), body: JSON.stringify(body) });
  const counts = async () => (await client.query(`SELECT
    (SELECT COUNT(*) FROM service_requests WHERE requester_id=$1)::int AS requests,
    (SELECT COUNT(*) FROM status_history WHERE changed_by=$1)::int AS history`, [users[0]])).rows[0];
  let created;
  await t.test('category lookup includes active categories and identifies Other, excluding inactive rows', async () => {
    const response = await fetch(`${base}/categories`, { headers: headers() });
    assert.equal(response.status, 200);
    const rows = await response.json();
    assert.equal(rows.some((c) => c.id === inactiveId), false);
    assert.equal(rows.find((c) => c.id === other.id).isOther, true);
    assert.equal(rows.find((c) => c.id === normalId).isOther, false);
    for (const row of rows) assert.deepEqual(Object.keys(row).sort(), ['id', 'isOther', 'name']);
  });
  await t.test('submission saves normalized content, signed-in owner and exactly one initial history entry', async () => {
    const response = await post({ categoryId: normalId, description: '  The light has stopped working.  ',
      otherExplanation: 'Not needed', requester_id: users[1], status: 'closed', reference: 'FORGED' });
    assert.equal(response.status, 201);
    created = await response.json();
    assert.deepEqual(Object.keys(created).sort(), ['id', 'reference']);
    assert.match(created.reference, /^CC-[0-9A-F]{16}$/);
    const row = (await client.query('SELECT * FROM service_requests WHERE id=$1', [created.id])).rows[0];
    assert.equal(row.requester_id, users[0]);
    assert.equal(row.description, 'The light has stopped working.');
    assert.equal(row.other_explanation, null);
    assert.equal(row.status, 'submitted');
    const history = (await client.query('SELECT * FROM status_history WHERE request_id=$1', [created.id])).rows;
    assert.equal(history.length, 1);
    assert.equal(history[0].old_status, null);
    assert.equal(history[0].new_status, 'submitted');
    assert.equal(history[0].changed_by, users[0]);
  });
  await t.test('created request is readable through details and My Requests but not by another requester', async () => {
    const response = await fetch(`${base}/requests/${created.id}`, { headers: headers() });
    assert.equal(response.status, 200);
    const detail = await response.json();
    assert.equal(detail.reference, created.reference);
    assert.deepEqual(detail.timeline.map((entry) => entry.message), ['Request submitted.']);
    const mine = await fetch(`${base}/requests/mine`, { headers: headers() });
    assert.ok((await mine.json()).some((row) => row.id === created.id));
    assert.equal((await fetch(`${base}/requests/${created.id}`, { headers: headers(1) })).status, 404);
  });
  for (const [name, body, field] of [
    ['malformed category', { categoryId: 'bad', description: 'Valid description' }, 'category'],
    ['unknown category', { categoryId: randomUUID(), description: 'Valid description' }, 'category'],
    ['inactive category', { categoryId: inactiveId, description: 'Valid description' }, 'category'],
    ['short description', { categoryId: normalId, description: 'x'.repeat(9) }, 'description'],
    ['long description', { categoryId: normalId, description: 'x'.repeat(1001) }, 'description'],
    ['missing Other explanation', { categoryId: other.id, description: 'Valid description' }, 'otherExplanation'],
  ]) {
    await t.test(`${name} produces field errors without saving request/history`, async () => {
      const before = await counts();
      const response = await post(body);
      assert.equal(response.status, 422);
      assert.ok((await response.json()).errors[field]);
      assert.deepEqual(await counts(), before);
    });
  }
  await t.test('Other explanation is stored and returned by details', async () => {
    const response = await post({ categoryId: other.id, description: 'An unusual local service problem.', otherExplanation: '  Public lighting  ' });
    assert.equal(response.status, 201);
    const row = await response.json();
    const detail = await fetch(`${base}/requests/${row.id}`, { headers: headers() });
    assert.equal((await detail.json()).otherExplanation, 'Public lighting');
  });
  await t.test('history SQL failure rolls back the inserted request too', async () => {
    const before = await counts();
    failHistory = true;
    const response = await post({ categoryId: normalId, description: 'Valid problem description' });
    failHistory = false;
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { message: 'Could not submit your request. Please try again.' });
    assert.deepEqual(await counts(), before);
  });
  await t.test('real reference uniqueness collision retries without duplicate history', async () => {
    const before = await counts();
    let attempts = 0;
    const newReference = `CC-${randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase()}`;
    const result = await submitRequest(db, { categoryId: normalId, description: 'Collision retry fixture' }, users[0],
      () => attempts++ === 0 ? created.reference : newReference);
    assert.equal(result.reference, newReference);
    assert.equal(attempts, 2);
    const after = await counts();
    assert.equal(after.requests, before.requests + 1);
    assert.equal(after.history, before.history + 1);
  });
  await t.test('equal timestamps put initial history before public comments', async () => {
    await client.query(`INSERT INTO request_entries (request_id,entry_type,author_id,content,created_at)
      SELECT request_id,'public',$2,'Later acknowledgement',changed_at FROM status_history WHERE request_id=$1`, [created.id, users[0]]);
    const response = await fetch(`${base}/requests/${created.id}`, { headers: headers() });
    assert.deepEqual((await response.json()).timeline.map((e) => e.message), ['Request submitted.', 'Later acknowledgement']);
  });
});
