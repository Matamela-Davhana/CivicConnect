const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const jwt = require('jsonwebtoken');

// This suite only reads pre-seeded data. No database stubs or silent skips.
// Fresh DB: run migrations 001, 002, then seed.sql. Existing DB: only apply 002.
test('real PostgreSQL login integration', async (t) => {
  assert.ok(process.env.DATABASE_URL, 'Set DATABASE_URL to an isolated, seeded local test database');
  const target = new URL(process.env.DATABASE_URL);
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname), 'Local database only');
  assert.ok(['/civicconnect_test', '/civicconnect_local_review'].includes(target.pathname), 'Test database only');
  assert.ok(process.env.JWT_SECRET, 'Set a disposable test JWT_SECRET');
  const db = require('../../db');
  let server;
  t.after(async () => {
    if (server) await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
    await db.end();
  });
  const app = require('../../server');
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = (email, password = 'password123') => fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  await t.test('health endpoint responds with the CI contract', async () => {
    const response = await fetch(`${base}/api/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok' });
  });
  for (const role of ['requester', 'staff', 'management', 'admin']) {
    await t.test(`${role} seed account authenticates against PostgreSQL`, async () => {
      const email = `${role}@example.com`;
      const { rows } = await db.query('SELECT id FROM users WHERE email=$1', [email]);
      assert.equal(rows.length, 1, 'Apply the corrected local seed before this suite');
      const response = await login(email);
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.user.id, rows[0].id);
      assert.equal(payload.user.role, role);
      assert.equal(payload.role, role);
      assert.equal(payload.user.email, email);
      assert.equal(Object.hasOwn(payload.user, 'password_hash'), false);
      const claims = jwt.verify(payload.token, process.env.JWT_SECRET);
      assert.equal(claims.id, rows[0].id);
      assert.equal(claims.role, role);
    });
  }
  for (const [name, email, password] of [
    ['wrong password', 'requester@example.com', 'incorrect'],
    ['unknown user', 'missing@example.test', 'password123'],
  ]) {
    await t.test(`${name} is rejected`, async () => {
      const response = await login(email, password);
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), { error: 'Invalid credentials' });
    });
  }
});
