const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Pool } = require('pg');
const { assertDisposable } = require('../../../../tools/devops/e2e-safety.cjs');

test('live HTTP journeys with durable PostgreSQL writes (no DB or HTTP mocks)', { timeout: 60000 }, async (t) => {
  assertDisposable(process.env);
  const db = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
  t.after(() => db.end());
  const base = process.env.BASE_URL;
  async function call(path, token, method = 'GET', body, status = 200) {
    const response = await fetch(`${base}/api${path}`, {
      method, signal: AbortSignal.timeout(10000),
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    assert.equal(response.status, status, `${method} ${path}`);
    return response.json();
  }
  const login = (email, password = 'password123', status = 200) => call('/auth/login', null, 'POST', { email, password }, status);
  const admin = await login('admin@example.com');
  const staff = await login('staff@example.com');
  const owner = await login('requester@example.com');
  const management = await login('management@example.com');
  const suffix = randomUUID();
  const email = `${suffix}@example.test`;
  const password = 'Disposable-E2E-Password-123!';
  let user, outsider, category, request;
  await t.test('admin creates durable account and category; fresh login works', async () => {
    user = await call('/admin/users', admin.token, 'POST', { name: `API ${suffix}`, email, password, role: 'requester' }, 201);
    assert.deepEqual(Object.keys(user).sort(), ['active', 'email', 'id', 'name', 'role']);
    outsider = await login(email, password);
    category = await call('/admin/categories', admin.token, 'POST', { name: `API-${suffix}` }, 201);
    assert.equal((await db.query('SELECT id FROM users WHERE id=$1', [user.id])).rowCount, 1);
    await call('/admin/users', admin.token, 'POST', { name: 'Duplicate', email: email.toUpperCase(), password, role: 'requester' }, 409);
  });
  await t.test('validation does not write; successful submission commits exactly one initial history', async () => {
    await call('/requests', owner.token, 'POST', { categoryId: category.id, description: 'short' }, 422);
    assert.equal((await db.query('SELECT id FROM service_requests WHERE category_id=$1', [category.id])).rowCount, 0);
    request = await call('/requests', owner.token, 'POST', { categoryId: category.id, description: 'Synthetic live API request for a broken streetlight.' }, 201);
    const history = await db.query('SELECT new_status FROM status_history WHERE request_id=$1', [request.id]);
    assert.deepEqual(history.rows, [{ new_status: 'submitted' }]);
    const detail = await call(`/requests/${request.id}`, owner.token);
    assert.equal(detail.category, category.name);
    assert.equal((await call('/requests/mine', owner.token)).some((r) => r.id === request.id), true);
  });
  await t.test('cross-owner, anonymous and management detail requests are denied', async () => {
    await call(`/requests/${request.id}`, outsider.token, 'GET', undefined, 404);
    await call(`/requests/${request.id}`, null, 'GET', undefined, 401);
    await call(`/requests/${request.id}`, management.token, 'GET', undefined, 403);
    await call('/admin/users', staff.token, 'GET', undefined, 403);
  });
  const detail = () => call(`/requests/${request.id}`, staff.token);
  const act = async (body) => call(`/requests/${request.id}/actions`, staff.token, 'POST', { rowVersion: (await detail()).rowVersion, ...body });
  await t.test('accept, assign, progress, hold, resume and privacy survive committed HTTP requests', async () => {
    await act({ action: 'accept', targetDate: '2030-12-31' });
    await act({ action: 'assign', assigneeId: staff.user.id });
    await act({ action: 'update', status: 'in_progress', visibility: 'public', message: 'Inspection started.' });
    await act({ action: 'update', visibility: 'internal', message: `Private-${suffix}` });
    await act({ action: 'update', status: 'on_hold', visibility: 'public', message: 'Waiting for parts.' });
    await act({ action: 'update', status: 'in_progress', visibility: 'public', message: 'Parts arrived.' });
    const publicDetail = await call(`/requests/${request.id}`, owner.token);
    assert.equal(publicDetail.status, 'in_progress');
    assert.equal(JSON.stringify(publicDetail).includes(`Private-${suffix}`), false);
    assert.equal((await detail()).timeline.some((entry) => entry.message === `Private-${suffix}`), true);
  });
  await t.test('two concurrent writes with one version yield one success and one conflict', async () => {
    const rowVersion = (await detail()).rowVersion;
    const results = await Promise.all(['A', 'B'].map((tag) => fetch(`${base}/api/requests/${request.id}/actions`, {
      method: 'POST', signal: AbortSignal.timeout(10000), headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${staff.token}` },
      body: JSON.stringify({ rowVersion, action: 'update', visibility: 'public', message: `Race-${suffix}-${tag}` }),
    })));
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
    await Promise.all(results.map((r) => r.json()));
    assert.equal((await detail()).rowVersion, rowVersion + 1);
    assert.equal((await db.query('SELECT id FROM request_entries WHERE request_id=$1 AND content LIKE $2', [request.id, `Race-${suffix}-%`])).rowCount, 1);
  });
  await t.test('resolve and close are durable and terminal; management sees aggregate-only data', async () => {
    const before = await call('/management/summary', management.token);
    await act({ action: 'update', status: 'resolved', visibility: 'public', message: 'Repair completed.' });
    await act({ action: 'update', status: 'closed', visibility: 'public', message: 'Final confirmation.' });
    const saved = await detail();
    assert.equal(saved.status, 'closed');
    await call(`/requests/${request.id}/actions`, staff.token, 'POST', { action: 'update', rowVersion: saved.rowVersion, visibility: 'public', message: 'Must fail.' }, 422);
    assert.equal((await db.query('SELECT status FROM service_requests WHERE id=$1', [request.id])).rows[0].status, 'closed');
    const after = await call('/management/summary', management.token);
    assert.equal(after.completed, before.completed + 1);
    assert.equal(after.open, before.open - 1);
    assert.deepEqual(Object.keys(after).sort(), ['byCategory', 'byStatus', 'completed', 'open', 'overdue']);
  });
  await t.test('category deactivation preserves history and denies new submissions', async () => {
    await call(`/admin/categories/${category.id}`, admin.token, 'PATCH', { active: false });
    assert.equal((await call('/categories', owner.token)).some((c) => c.id === category.id), false);
    await call('/requests', owner.token, 'POST', { categoryId: category.id, description: 'Must not be saved after deactivation.' }, 422);
    assert.equal((await call(`/requests/${request.id}`, owner.token)).category, category.name);
    await call(`/admin/categories/${category.id}`, admin.token, 'PATCH', { active: true });
  });
  await t.test('role change and deactivation revoke sessions; reactivation requires fresh login', async () => {
    await call(`/admin/users/${user.id}`, admin.token, 'PATCH', { role: 'staff' });
    await call('/requests/mine', outsider.token, 'GET', undefined, 401);
    const fresh = await login(email, password);
    await call('/staff/requests', fresh.token);
    await call(`/admin/users/${user.id}`, admin.token, 'PATCH', { active: false });
    await login(email, password, 401);
    await call('/staff/requests', fresh.token, 'GET', undefined, 401);
    await call(`/admin/users/${user.id}`, admin.token, 'PATCH', { active: true });
    await call('/staff/requests', fresh.token, 'GET', undefined, 401);
    await call('/staff/requests', (await login(email, password)).token);
  });
});
