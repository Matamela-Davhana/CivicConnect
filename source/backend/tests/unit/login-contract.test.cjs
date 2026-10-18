const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// Real HTTP, Express, password hashing and JWTs; the database is deliberately
// replaced before loading the app. This is NOT a PostgreSQL integration test.
test('frontend login contract with an isolated database stub', async (t) => {
  const dbPath = require.resolve('../../db');
  const previousDb = require.cache[dbPath];
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'disposable-login-contract-test-only-not-for-deployment';
  const password = 'Disposable-test-password';
  const passwordHash = await bcrypt.hash(password, 4);
  const roles = ['requester', 'staff', 'management', 'admin'];
  const users = roles.map((role, index) => ({
    id: index + 1, name: `Test ${role}`, email: `${role}@example.test`,
    role, password_hash: passwordHash,
  }));
  require.cache[dbPath] = {
    id: dbPath, filename: dbPath, loaded: true,
    exports: {
      async query(sql, params) {
        assert.equal(sql, 'SELECT * FROM users WHERE email=$1');
        return { rows: users.filter((user) => user.email === params[0]) };
      },
    },
  };
  let server;
  t.after(async () => {
    if (server) {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
    if (previousDb) require.cache[dbPath] = previousDb;
    else delete require.cache[dbPath];
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  });
  const app = require('../../server');
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = (email, candidate = password, path = '/api/auth/login') => fetch(`${base}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: candidate }),
  });

  for (const user of users) {
    await t.test(`login returns user.role and a matching token for ${user.role}`, async () => {
      const response = await login(user.email);
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.deepEqual(payload.user, {
        id: user.id, name: user.name, email: user.email, role: user.role,
      });
      // Retain the original top-level role for any existing consumers.
      assert.equal(payload.role, user.role);
      assert.equal(JSON.stringify(payload).includes(passwordHash), false);
      const claims = jwt.verify(payload.token, process.env.JWT_SECRET);
      assert.equal(claims.id, user.id);
      assert.equal(claims.role, user.role);
      assert.equal(claims.exp - claims.iat, 3600);
    });
  }
  await t.test('wrong password is rejected without returning a token', async () => {
    const response = await login(users[0].email, 'incorrect');
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'Invalid credentials' });
  });
  await t.test('unknown account is rejected without returning a token', async () => {
    const response = await login('missing@example.test');
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'Invalid credentials' });
  });
  await t.test('unprefixed login is not the configured API route', async () => {
    const response = await login(users[0].email, password, '/auth/login');
    assert.equal(response.status, 404);
  });
  for (const path of ['/api/requests', '/api/staff/requests']) {
    await t.test(`${path} is mounted and rejects anonymous access`, async () => {
      const response = await fetch(`${base}${path}`);
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), { error: 'No token' });
    });
  }
});
