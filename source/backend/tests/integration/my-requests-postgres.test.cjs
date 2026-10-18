const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { randomUUID } = require('node:crypto');
const bcrypt = require('bcrypt');

test('My Requests against PostgreSQL with rollback-only fixtures', { timeout: 30000 }, async (t) => {
  assert.ok(process.env.DATABASE_URL, 'Set a local test DATABASE_URL');
  const target = new URL(process.env.DATABASE_URL);
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(target.hostname), 'Local database only');
  assert.ok(['/civicconnect_test', '/civicconnect_local_review'].includes(target.pathname), 'Test database only');
  assert.ok(process.env.JWT_SECRET, 'Set a disposable JWT_SECRET');
  const db = require('../../db');
  db.options.connectionTimeoutMillis = 5000;
  const originalQuery = db.query;
  let client;
  let server;
  const users = [randomUUID(), randomUUID(), randomUUID()];
  const requestIds = [randomUUID(), randomUUID(), randomUUID()];
  t.after(async () => {
    try {
      if (server) await new Promise((resolve) => server.close(resolve));
      if (client) {
        await client.query('ROLLBACK');
        const { rows } = await client.query('SELECT id FROM users WHERE id = ANY($1::uuid[])', [users]);
        assert.equal(rows.length, 0, 'Rollback must remove all temporary users');
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
  // Bind app queries to the same real PostgreSQL transaction. SQL is not mocked;
  // isolation lets the HTTP app see fixtures without ever committing test data.
  db.query = (...args) => client.query(...args);
  const password = randomUUID();
  const hash = await bcrypt.hash(password, 4);
  for (const id of users) {
    await client.query("INSERT INTO users (id, name, email, password_hash, role) VALUES ($1,'Temporary requester',$2,$3,'requester')",
      [id, `${id}@example.test`, hash]);
  }
  const category = (await client.query("SELECT id, name FROM categories WHERE name='IT Support'")).rows[0];
  assert.ok(category, 'Apply the initial schema first');
  for (const [index, date] of ['2026-10-01', '2026-10-03', '2026-10-04'].entries()) {
    await client.query(`INSERT INTO service_requests
      (id, reference, category_id, description, requester_id, submitted_at)
      VALUES ($1,$2,$3,'Private fixture description',$4,$5)`,
    [requestIds[index], `T-${randomUUID().replaceAll('-', '').slice(0, 16)}`, category.id,
      users[index === 2 ? 1 : 0], `${date}T00:00:00Z`]);
  }
  await client.query(`INSERT INTO status_history (request_id, new_status, changed_by, changed_at)
    VALUES ($1,'submitted',$2,'2026-10-06T00:00:00Z')`, [requestIds[0], users[0]]);
  for (const id of requestIds.slice(0, 2)) {
    await client.query(`INSERT INTO request_entries (request_id, entry_type, author_id, content, created_at)
      VALUES ($1,'public',$2,'Public fixture','2026-10-05T00:00:00Z'),
             ($1,'internal',$2,'Internal fixture must stay private','2026-10-09T00:00:00Z')`, [id, users[0]]);
  }
  server = require('../../server').listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const tokens = [];
  for (const id of users) {
    const response = await fetch(`${base}/api/auth/login`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `${id}@example.test`, password }) });
    assert.equal(response.status, 200);
    tokens.push((await response.json()).token);
  }
  const list = async (index, suffix = '') => {
    const response = await fetch(`${base}/api/requests/mine${suffix}`, { headers: { Authorization: `Bearer ${tokens[index]}` } });
    assert.equal(response.status, 200);
    return response.json();
  };
  await t.test('first requester sees only their own rows, newest first', async () => {
    const rows = await list(0);
    assert.deepEqual(rows.map((r) => r.id), [requestIds[1], requestIds[0]]);
    for (const row of rows) {
      assert.deepEqual(Object.keys(row).sort(), ['category', 'createdAt', 'id', 'reference', 'status', 'updatedAt']);
      assert.equal(row.category, 'IT Support');
      assert.equal(row.status, 'submitted');
      assert.ok(row.reference.startsWith('T-'));
    }
    assert.equal(rows[0].createdAt, '2026-10-03T00:00:00.000Z');
  });
  await t.test('second requester cannot select the first requester via query parameters', async () => {
    const rows = await list(1, `?requester_id=${users[0]}&userId=${users[0]}`);
    assert.deepEqual(rows.map((r) => r.id), [requestIds[2]]);
  });
  await t.test('requester with no requests receives an empty array', async () => {
    assert.deepEqual(await list(2), []);
  });
  await t.test('last updated includes status/public changes but excludes internal comments', async () => {
    const rows = await list(0);
    assert.equal(rows[0].updatedAt, '2026-10-05T00:00:00.000Z');
    assert.equal(rows[1].updatedAt, '2026-10-06T00:00:00.000Z');
  });
  await t.test('last updated falls back to submission when there are no updates', async () => {
    const [row] = await list(1);
    assert.equal(row.updatedAt, row.createdAt);
  });
});
