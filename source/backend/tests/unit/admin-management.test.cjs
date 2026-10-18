const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const admin = require('../../services/admin-management');
const actor = { id: '11111111-1111-4111-8111-111111111111', tokenVersion: 0 };
const id = '22222222-2222-4222-8222-222222222222';
const input = { name: ' Test person ', email: ' TEST@example.test ', role: 'requester', password: 'Disposable-password-123' };

test('admin form validation rejects invalid types and boundary values', () => {
  for (const body of [null, [], {}, { ...input, name: ' ' }, { ...input, name: 'x'.repeat(151) },
    { ...input, email: 'bad' }, { ...input, email: 'a@b@c.test' }, { ...input, email: 'x'.repeat(256) },
    { ...input, role: 'owner' }, { ...input, password: 'x'.repeat(11) }, { ...input, password: 'x'.repeat(73) },
    { ...input, password: 'é'.repeat(37) }, { ...input, password: {} }, { ...input, password: ' '.repeat(12) }]) {
    assert.throws(() => admin.validateUser(body), (e) => e.status === 422);
  }
  assert.equal(admin.validateUser(input).email, 'test@example.test');
  assert.equal(admin.validateUser(input).name, 'Test person');
  for (const password of ['x'.repeat(12), 'x'.repeat(72), 'é'.repeat(36)]) assert.equal(admin.validateUser({ ...input, password }).password, password);
  for (const body of [null, [], {}, { active: 'false' }, { active: null }, { password: 'bad' }, { role: 'owner' }]) {
    assert.throws(() => admin.validatePatch(body, true), (e) => e.status === 422);
  }
  assert.throws(() => admin.validatePatch({ role: 'admin' }), (e) => e.status === 422);
});

function fake(options = {}) {
  const calls = [];
  const target = { id, name: 'Target', email: 'target@example.test', role: 'staff', active: true, ...options.target };
  return { calls, async connect() { return {
    async query(sql, params) {
      calls.push({ sql, params });
      if (options.fail && sql.startsWith(options.fail)) throw new Error('Private diagnostic');
      if (sql.startsWith('SELECT role, active')) return { rows: options.actorMissing ? [] : [{ role: 'admin', active: true, token_version: 0, ...options.actor }] };
      if (sql.includes('FOR UPDATE')) return { rows: options.missing ? [] : [target] };
      if (sql.includes('COUNT(*)')) return { rows: [{ count: options.adminCount ?? 2 }] };
      if (sql.startsWith('UPDATE users')) return { rows: [{ ...target, role: params[0], active: params[1] }] };
      if (sql.startsWith('INSERT INTO users')) {
        assert.equal(params[0], 'Test person');
        assert.equal(params[1], 'test@example.test');
        assert.ok(await bcrypt.compare(input.password, params[2]));
        assert.equal(bcrypt.getRounds(params[2]), 12);
        assert.doesNotMatch(sql, /RETURNING \*|RETURNING.*password_hash/);
        return { rows: [{ ...target, role: 'requester' }] };
      }
      if (/^(INSERT INTO|UPDATE) categories/.test(sql)) return { rows: options.missing ? [] : [{ id, name: 'Category', active: true }] };
      return { rows: [] };
    }, release() { calls.push({ sql: 'RELEASE' }); },
  }; } };
}

test('admin writes enforce actor/self/last-admin safeguards and transaction cleanup', async (t) => {
  await t.test('creation hashes passwords and returns public account fields only', async () => {
    const db = fake();
    const result = await admin.createUser(db, input, actor);
    assert.deepEqual(Object.keys(result).sort(), ['active', 'email', 'id', 'name', 'role']);
    assert.deepEqual(db.calls.slice(-2).map((c) => c.sql), ['COMMIT', 'RELEASE']);
  });
  await t.test('role changes preserve active state and revoke prior tokens', async () => {
    const db = fake();
    const result = await admin.updateUser(db, id, { role: 'management' }, actor);
    assert.equal(result.role, 'management');
    const change = db.calls.find((c) => c.sql.startsWith('UPDATE users'));
    assert.match(change.sql, /token_version=token_version\+1/);
    assert.deepEqual(change.params, ['management', true, id]);
    assert.match(db.calls[1].sql, /pg_advisory_xact_lock/);
  });
  await t.test('deactivation preserves role, while a no-op avoids token invalidation', async () => {
    const db = fake();
    assert.equal((await admin.updateUser(db, id, { active: false }, actor)).role, 'staff');
    const unchanged = fake();
    await admin.updateUser(unchanged, id, { role: 'staff' }, actor);
    assert.equal(unchanged.calls.some((c) => c.sql.startsWith('UPDATE')), false);
  });
  await t.test('self changes are rejected before acquiring a connection', async () => {
    const db = fake();
    await assert.rejects(admin.updateUser(db, actor.id, { active: false }, actor), (e) => e.status === 403);
    assert.equal(db.calls.length, 0);
  });
  for (const options of [{ actor: { role: 'staff' } }, { actor: { active: false } }, { actor: { token_version: 1 } }, { actorMissing: true }]) {
    await t.test('actor is revalidated inside the serialized transaction', async () => {
      const db = fake(options);
      await assert.rejects(admin.updateUser(db, id, { active: false }, actor), (e) => e.status === 401);
      assert.equal(db.calls.some((c) => c.sql.startsWith('UPDATE')), false);
      assert.deepEqual(db.calls.slice(-2).map((c) => c.sql), ['ROLLBACK', 'RELEASE']);
    });
  }
  await t.test('last active administrator cannot be removed', async () => {
    for (const patch of [{ active: false }, { role: 'requester' }]) {
      const db = fake({ target: { role: 'admin' }, adminCount: 1 });
      await assert.rejects(admin.updateUser(db, id, patch, actor), (e) => e.status === 409);
    }
  });
  await t.test('missing users/categories and malformed IDs do not create records', async () => {
    await assert.rejects(admin.updateUser(fake({ missing: true }), id, { active: false }, actor), (e) => e.status === 404);
    await assert.rejects(admin.updateCategory(fake({ missing: true }), id, { active: false }, actor), (e) => e.status === 404);
    await assert.rejects(admin.updateUser(fake(), 'bad', { active: false }, actor), (e) => e.status === 404);
  });
  await t.test('category names enforce trimmed 1–50 character boundaries', async () => {
    for (const name of ['', ' ', 'x'.repeat(51), null]) await assert.rejects(admin.createCategory(fake(), { name }, actor), (e) => e.status === 422);
    await admin.createCategory(fake(), { name: 'x'.repeat(50) }, actor);
  });
  await t.test('write failure rolls back and releases the connection', async () => {
    const db = fake({ fail: 'UPDATE users' });
    await assert.rejects(admin.updateUser(db, id, { active: false }, actor));
    assert.deepEqual(db.calls.slice(-2).map((c) => c.sql), ['ROLLBACK', 'RELEASE']);
  });
});

test('admin HTTP routes deny other roles and return safe errors', async (t) => {
  require('../helpers/stub-account-sessions.cjs').stubAccountSessions(t);
  const path = require.resolve('../../db');
  const previous = require.cache[path];
  const oldSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'disposable-admin-route-test-only';
  let calls = 0;
  let fail;
  const db = fake();
  require.cache[path] = { id: path, filename: path, loaded: true, exports: {
    async connect() { calls++; if (fail) throw fail; return db.connect(); },
    async query(sql) { calls++; if (fail) throw fail; assert.doesNotMatch(sql, /password|token_version|SELECT \*/); return { rows: [] }; },
  } };
  const server = require('../../server').listen(0, '127.0.0.1');
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    if (previous) require.cache[path] = previous; else delete require.cache[path];
    if (oldSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = oldSecret;
  });
  await once(server, 'listening');
  const request = (path, method = 'GET', role = 'admin', body) => fetch(`http://127.0.0.1:${server.address().port}/api/admin/${path}`, { method,
    headers: { 'Content-Type': 'application/json', ...(role ? { Authorization: `Bearer ${jwt.sign({ id: actor.id, role }, process.env.JWT_SECRET)}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  for (const role of [null, 'requester', 'staff', 'management']) await t.test(`${role || 'anonymous'} denied on all six endpoints`, async () => {
    const before = calls;
    for (const resource of ['users', 'categories']) for (const method of ['GET', 'POST', 'PATCH']) {
      const response = await request(resource + (method === 'PATCH' ? `/${id}` : ''), method, role, method === 'GET' ? undefined : {});
      assert.equal(response.status, role ? 403 : 401);
    }
    assert.equal(calls, before);
  });
  await t.test('lists use explicit safe projections', async () => {
    for (const resource of ['users', 'categories']) assert.deepEqual(await (await request(resource)).json(), []);
  });
  await t.test('duplicate errors are 409 and unexpected errors do not leak SQL', async () => {
    fail = Object.assign(new Error('Private SQL'), { code: '23505' });
    assert.equal((await request('categories', 'POST', 'admin', { name: 'Duplicate' })).status, 409);
    fail = new Error('Private SQL');
    const response = await request('users');
    assert.equal(response.status, 500);
    assert.doesNotMatch(JSON.stringify(await response.json()), /Private|SQL/);
  });
});
