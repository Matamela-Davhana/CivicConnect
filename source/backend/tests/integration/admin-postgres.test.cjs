const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { randomUUID } = require('node:crypto');
const bcrypt = require('bcrypt');

test('admin management and session revocation against PostgreSQL with rollback-only fixtures', { timeout: 30000 }, async (t) => {
  assert.ok(process.env.DATABASE_URL);
  const target = new URL(process.env.DATABASE_URL);
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(target.hostname));
  assert.ok(['/civicconnect_test', '/civicconnect_local_review'].includes(target.pathname));
  assert.ok(process.env.JWT_SECRET);
  const db = require('../../db');
  db.options.connectionTimeoutMillis = 5000;
  const originalQuery = db.query;
  const originalConnect = db.connect;
  const ids = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  const emails = ids.map((id) => `${id}@example.test`);
  const roles = ['admin', 'admin', 'requester', 'staff'];
  const password = 'Disposable-admin-fixture-123';
  let client;
  let server;
  let createdId;
  let categoryId;
  let failWrite = false;
  t.after(async () => {
    try {
      if (server) await new Promise((resolve) => server.close(resolve));
      if (client) {
        await client.query('ROLLBACK');
        assert.equal((await client.query('SELECT id FROM users WHERE id=ANY($1::uuid[])', [[...ids, ...(createdId ? [createdId] : [])]])).rows.length, 0);
        if (categoryId) assert.equal((await client.query('SELECT id FROM categories WHERE id=$1', [categoryId])).rows.length, 0);
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
  await client.query("SET LOCAL statement_timeout='5s'");
  await client.query('SELECT active, token_version FROM users LIMIT 0'); // Migration 002 required; never silently skip.
  db.query = (...args) => client.query(...args);
  db.connect = async () => ({
    async query(sql, params) {
      if (sql === 'BEGIN') return client.query('SAVEPOINT admin_test');
      if (sql === 'COMMIT') return client.query('RELEASE SAVEPOINT admin_test');
      if (sql === 'ROLLBACK') {
        await client.query('ROLLBACK TO SAVEPOINT admin_test');
        return client.query('RELEASE SAVEPOINT admin_test');
      }
      if (failWrite && sql.startsWith('UPDATE users')) return client.query('SELECT deliberately_missing_admin_test_column');
      return client.query(sql, params);
    }, release() {},
  });
  const hash = await bcrypt.hash(password, 4);
  for (const [index, id] of ids.entries()) await client.query(
    'INSERT INTO users (id,name,email,password_hash,role) VALUES ($1,$2,$3,$4,$5)', [id, `Admin fixture ${index}`, emails[index], hash, roles[index]]);
  server = require('../../server').listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const login = async (email, candidate = password, expected = 200) => {
    const response = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: candidate }) });
    assert.equal(response.status, expected);
    return (await response.json()).token;
  };
  const tokens = [];
  for (const email of emails) tokens.push(await login(email));
  const request = (path, method = 'GET', body, token = tokens[0]) => fetch(base + path, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const patch = (id, body) => request(`/admin/users/${id}`, 'PATCH', body);
  const createdEmail = `${randomUUID()}@example.test`;
  await t.test('admin lists safe fields while non-admins cannot access or write admin endpoints', async () => {
    const response = await request('/admin/users');
    assert.equal(response.status, 200);
    for (const row of await response.json()) assert.deepEqual(Object.keys(row).sort(), ['active', 'email', 'id', 'name', 'role']);
    for (const token of [null, tokens[2], tokens[3]]) for (const resource of ['users', 'categories']) for (const method of ['GET', 'POST', 'PATCH']) {
      const response = await request(`/admin/${resource}${method === 'PATCH' ? `/${ids[1]}` : ''}`, method, method === 'GET' ? undefined : {}, token);
      assert.equal(response.status, token ? 403 : 401);
    }
  });
  await t.test('creates a normalized account with a bcrypt password, no secret response and usable login', async () => {
    const response = await request('/admin/users', 'POST', { name: '  Created fixture  ', email: ` ${createdEmail.toUpperCase()} `,
      role: 'requester', password, active: false, token_version: 999 });
    assert.equal(response.status, 201);
    const body = await response.json();
    createdId = body.id;
    assert.deepEqual(Object.keys(body).sort(), ['active', 'email', 'id', 'name', 'role']);
    assert.equal(body.name, 'Created fixture');
    assert.equal(body.email, createdEmail);
    assert.equal(body.active, true);
    const row = (await client.query('SELECT password_hash,token_version FROM users WHERE id=$1', [createdId])).rows[0];
    assert.ok(await bcrypt.compare(password, row.password_hash));
    assert.equal(bcrypt.getRounds(row.password_hash), 12);
    assert.equal(row.token_version, 0);
    await login(createdEmail.toUpperCase());
  });
  await t.test('duplicate email, invalid password and invalid role do not create another user', async () => {
    const count = async () => (await client.query('SELECT COUNT(*)::int AS count FROM users')).rows[0].count;
    const before = await count();
    for (const [body, expected] of [
      [{ name: 'Duplicate', email: createdEmail.toUpperCase(), role: 'staff', password }, 409],
      [{ name: 'Invalid', email: `${randomUUID()}@example.test`, role: 'staff', password: 'short' }, 422],
      [{ name: 'Invalid', email: `${randomUUID()}@example.test`, role: 'owner', password }, 422],
    ]) assert.equal((await request('/admin/users', 'POST', body)).status, expected);
    assert.equal(await count(), before);
  });
  await t.test('self role/status changes are forbidden, including uppercase UUIDs', async () => {
    for (const body of [{ active: false }, { role: 'requester' }]) assert.equal((await patch(ids[0].toUpperCase(), body)).status, 403);
    assert.equal((await request('/admin/users')).status, 200);
  });
  await t.test('a role change revokes old sessions and fresh login uses the new role', async () => {
    const old = await login(createdEmail);
    assert.equal((await patch(createdId, { role: 'staff' })).status, 200);
    assert.equal((await request('/requests/mine', 'GET', undefined, old)).status, 401);
    const fresh = await login(createdEmail);
    assert.equal((await request('/staff/requests', 'GET', undefined, fresh)).status, 200);
    assert.equal((await request('/admin/users', 'GET', undefined, fresh)).status, 403);
  });
  await t.test('deactivation rejects login and existing sessions; reactivation never revives old tokens', async () => {
    const old = await login(createdEmail);
    assert.equal((await patch(createdId, { active: false })).status, 200);
    await login(createdEmail, password, 401);
    assert.equal((await request('/staff/requests', 'GET', undefined, old)).status, 401);
    const staffList = await (await request('/staff/assignees', 'GET', undefined, tokens[3])).json();
    assert.equal(staffList.some((row) => row.id === createdId), false);
    assert.equal((await patch(createdId, { active: true })).status, 200);
    assert.equal((await request('/staff/requests', 'GET', undefined, old)).status, 401);
    assert.equal((await request('/staff/requests', 'GET', undefined, await login(createdEmail))).status, 200);
  });
  await t.test('demoted administrator cannot use their previously signed admin token', async () => {
    assert.equal((await patch(ids[1], { role: 'requester' })).status, 200);
    assert.equal((await request('/admin/users', 'GET', undefined, tokens[1])).status, 401);
    assert.equal((await request('/admin/categories', 'POST', { name: 'Unauthorized' }, tokens[1])).status, 401);
  });
  await t.test('failed account writes roll back account state and session version', async () => {
    const read = async () => (await client.query('SELECT role,active,token_version FROM users WHERE id=$1', [createdId])).rows[0];
    const before = await read();
    failWrite = true;
    assert.equal((await patch(createdId, { active: false })).status, 500);
    failWrite = false;
    assert.deepEqual(await read(), before);
  });
  const categoryName = `Fixture-${randomUUID()}`;
  await t.test('creates a category, rejects case-insensitive duplicates and returns safe list fields', async () => {
    const response = await request('/admin/categories', 'POST', { name: ` ${categoryName} ` });
    assert.equal(response.status, 201);
    const category = await response.json();
    categoryId = category.id;
    assert.equal(category.name, categoryName);
    assert.equal(category.active, true);
    assert.equal((await request('/admin/categories', 'POST', { name: categoryName.toUpperCase() })).status, 409);
    assert.equal((await request('/admin/categories', 'POST', { name: 'x'.repeat(51) })).status, 422);
    for (const row of await (await request('/admin/categories')).json()) assert.deepEqual(Object.keys(row).sort(), ['active', 'id', 'name']);
  });
  await t.test('category deactivation preserves old requests, blocks new submissions and can be reversed', async () => {
    const body = { categoryId, description: 'Local admin test request fixture' };
    const response = await request('/requests', 'POST', body, tokens[2]);
    assert.equal(response.status, 201);
    const created = await response.json();
    assert.equal((await request(`/admin/categories/${categoryId}`, 'PATCH', { active: false })).status, 200);
    const available = await (await request('/categories', 'GET', undefined, tokens[2])).json();
    assert.equal(available.some((row) => row.id === categoryId), false);
    assert.equal((await request('/requests', 'POST', body, tokens[2])).status, 422);
    const detail = await (await request(`/requests/${created.id}`, 'GET', undefined, tokens[2])).json();
    assert.equal(detail.category, categoryName);
    assert.equal((await request(`/admin/categories/${categoryId}`, 'PATCH', { active: true })).status, 200);
    assert.equal((await request('/requests', 'POST', body, tokens[2])).status, 201);
  });
  await t.test('invalid patches and missing IDs have explicit non-success responses', async () => {
    assert.equal((await patch(createdId, { active: 'false' })).status, 422);
    assert.equal((await patch(createdId, { password: 'not-an-update-field' })).status, 422);
    assert.equal((await patch(randomUUID(), { active: false })).status, 404);
    assert.equal((await request(`/admin/categories/${randomUUID()}`, 'PATCH', { active: false })).status, 404);
  });
});
