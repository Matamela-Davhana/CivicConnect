const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { randomUUID } = require('node:crypto');
const bcrypt = require('bcrypt');

test('staff lifecycle against PostgreSQL with rollback-only fixtures', { timeout: 30000 }, async (t) => {
  assert.ok(process.env.DATABASE_URL, 'Set a local test DATABASE_URL');
  const target = new URL(process.env.DATABASE_URL);
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(target.hostname));
  assert.ok(['/civicconnect_test', '/civicconnect_local_review'].includes(target.pathname));
  assert.ok(process.env.JWT_SECRET);
  const db = require('../../db');
  db.options.connectionTimeoutMillis = 5000;
  const originalQuery = db.query;
  const originalConnect = db.connect;
  const roles = ['requester', 'staff', 'staff', 'management', 'admin'];
  const users = roles.map(() => randomUUID());
  const categoryId = randomUUID();
  const requestId = randomUUID();
  const rejectionId = randomUUID();
  const reference = `T-${randomUUID().replaceAll('-', '').slice(0, 16)}`;
  let client;
  let server;
  let failAudit = '';
  t.after(async () => {
    try {
      if (server) await new Promise((resolve) => server.close(resolve));
      if (client) {
        await client.query('ROLLBACK');
        assert.equal((await client.query('SELECT id FROM users WHERE id=ANY($1::uuid[])', [users])).rows.length, 0);
        assert.equal((await client.query('SELECT id FROM service_requests WHERE id=ANY($1::uuid[])', [[requestId, rejectionId]])).rows.length, 0);
        assert.equal((await client.query('SELECT id FROM categories WHERE id=$1', [categoryId])).rows.length, 0);
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
  // Application SQL is real. Only transaction boundaries are adapted so these
  // fixtures never persist. This does not prove multi-connection race behaviour.
  db.connect = async () => ({
    async query(sql, params) {
      if (sql === 'BEGIN') return client.query('SAVEPOINT staff_test');
      if (sql === 'COMMIT') return client.query('RELEASE SAVEPOINT staff_test');
      if (sql === 'ROLLBACK') {
        await client.query('ROLLBACK TO SAVEPOINT staff_test');
        return client.query('RELEASE SAVEPOINT staff_test');
      }
      if (failAudit && sql.includes(`INSERT INTO ${failAudit}`)) return client.query('SELECT deliberately_missing_staff_test_column');
      return client.query(sql, params);
    },
    release() {},
  });
  const password = randomUUID();
  const hash = await bcrypt.hash(password, 4);
  for (const [index, id] of users.entries()) await client.query(
    'INSERT INTO users (id,name,email,password_hash,role) VALUES ($1,$2,$3,$4,$5)',
    [id, `Staff fixture ${index}`, `${id}@example.test`, hash, roles[index]]);
  await client.query('INSERT INTO categories (id,name) VALUES ($1,$2)', [categoryId, `Staff-${categoryId}`]);
  for (const [index, id] of [requestId, rejectionId].entries()) {
    await client.query(`INSERT INTO service_requests (id,reference,category_id,description,requester_id,submitted_at)
      VALUES ($1,$2,$3,'Staff lifecycle fixture',$4,$5)`,
    [id, index ? `${reference}R` : reference, categoryId, users[0], `2026-10-0${index + 1}T00:00:00Z`]);
    await client.query("INSERT INTO status_history (request_id,new_status,changed_by) VALUES ($1,'submitted',$2)", [id, users[0]]);
  }
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
  const headers = (user = 1) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${tokens[user]}` });
  const get = (path, user = 1) => fetch(base + path, { headers: headers(user) });
  const post = (body, id = requestId, user = 1) => fetch(`${base}/requests/${id}/actions`, {
    method: 'POST', headers: headers(user), body: JSON.stringify(body),
  });
  const snapshot = async (id = requestId) => ({
    row: (await client.query('SELECT status,assignee_id,target_resolution_date::text AS target,row_version FROM service_requests WHERE id=$1', [id])).rows[0],
    history: (await client.query('SELECT * FROM status_history WHERE request_id=$1 ORDER BY id', [id])).rows,
    entries: (await client.query('SELECT * FROM request_entries WHERE request_id=$1 ORDER BY id', [id])).rows,
  });
  let version = 1;
  const save = async (body, status) => {
    const response = await post({ ...body, rowVersion: version });
    const payload = await response.json();
    assert.equal(response.status, 200, JSON.stringify(payload));
    assert.deepEqual(payload, { id: requestId, status, rowVersion: version + 1 });
    version++;
    return snapshot();
  };
  await t.test('queue returns minimal frontend fields, newest first, with category/status/reference filters', async () => {
    const response = await get(`/staff/requests?category=${categoryId}&status=submitted&q=${reference.toLowerCase()}`);
    assert.equal(response.status, 200);
    const rows = await response.json();
    assert.deepEqual(rows.map((row) => row.id), [rejectionId, requestId]);
    for (const row of rows) {
      assert.deepEqual(Object.keys(row).sort(), ['assignee', 'category', 'createdAt', 'id', 'reference', 'requester', 'status', 'targetDate']);
      assert.deepEqual(row.requester, { id: users[0], name: 'Staff fixture 0' });
      assert.equal(row.assignee, null);
    }
    assert.deepEqual(await (await get(`/staff/requests?category=${categoryId}&q=%25`)).json(), []);
    assert.deepEqual(await (await get(`/staff/requests?category=${categoryId}&status=closed`)).json(), []);
  });
  await t.test('assignee directory contains staff only, without email/password data', async () => {
    const response = await get('/staff/assignees');
    assert.equal(response.status, 200);
    const rows = await response.json();
    assert.ok(rows.some((row) => row.id === users[1]));
    assert.ok(rows.some((row) => row.id === users[2]));
    for (const row of rows) assert.deepEqual(Object.keys(row).sort(), ['id', 'name']);
    for (const index of [0, 3, 4]) assert.equal(rows.some((row) => row.id === users[index]), false);
  });
  await t.test('non-staff cannot read the queue/directory or modify a request', async () => {
    const before = await snapshot();
    for (const user of [0, 3, 4]) {
      assert.equal((await get('/staff/requests', user)).status, 403);
      assert.equal((await get('/staff/assignees', user)).status, 403);
      assert.equal((await post({ action: 'accept', rowVersion: 1, targetDate: '2026-11-01' }, requestId, user)).status, 403);
    }
    assert.deepEqual(await snapshot(), before);
  });
  await t.test('missing/invalid acceptance dates do not alter requests or history', async () => {
    const before = await snapshot();
    for (const targetDate of [undefined, '', '2026-02-29', '2026-04-31']) {
      assert.equal((await post({ action: 'accept', rowVersion: 1, targetDate })).status, 422);
    }
    assert.deepEqual(await snapshot(), before);
  });
  for (const table of ['status_history', 'request_entries']) await t.test(`${table} SQL failure rolls back status, date, version and all audit writes`, async () => {
    const before = await snapshot();
    failAudit = table;
    const response = await post({ action: 'accept', rowVersion: 1, targetDate: '2026-11-01' });
    failAudit = '';
    assert.equal(response.status, 500);
    assert.deepEqual(await snapshot(), before);
  });
  await t.test('acceptance saves its date and attributable history atomically', async () => {
    const state = await save({ action: 'accept', targetDate: '2026-11-01', actorId: users[4] }, 'accepted');
    assert.equal(state.row.target, '2026-11-01');
    const history = state.history.find((h) => h.new_status === 'accepted');
    assert.equal(history.old_status, 'submitted');
    assert.equal(history.changed_by, users[1]);
    assert.equal(state.entries[0].author_id, users[1]);
    assert.equal(state.entries[0].entry_type, 'public');
  });
  await t.test('second staff member using the old version receives 409 without changing anything', async () => {
    const before = await snapshot();
    const response = await post({ action: 'reject', reason: 'Stale decision', rowVersion: 1 }, requestId, 2);
    assert.equal(response.status, 409);
    assert.deepEqual(await snapshot(), before);
    const detail = await (await get(`/requests/${requestId}`)).json();
    assert.equal(detail.rowVersion, version);
  });
  await t.test('assignment rejects a requester or nonexistent staff ID and rejects skipped lifecycle steps', async () => {
    const before = await snapshot();
    for (const assigneeId of [users[0], randomUUID()]) assert.equal((await post({ action: 'assign', assigneeId, rowVersion: version })).status, 422);
    assert.equal((await post({ action: 'update', status: 'resolved', message: 'Skip stages', visibility: 'public', rowVersion: version })).status, 422);
    assert.deepEqual(await snapshot(), before);
  });
  await t.test('assignment selects a real staff member and appends an internal assignment audit', async () => {
    const state = await save({ action: 'assign', assigneeId: users[2] }, 'assigned');
    assert.equal(state.row.assignee_id, users[2]);
    assert.ok(state.entries.some((e) => e.entry_type === 'internal' && e.content === 'Assigned to Staff fixture 2.'));
    const row = (await (await get(`/staff/requests?category=${categoryId}&status=assigned`)).json())[0];
    assert.deepEqual(row.assignee, { id: users[2], name: 'Staff fixture 2' });
    assert.equal(row.targetDate, '2026-11-01');
  });
  await t.test('target-date change appends public audit without extra status history', async () => {
    const before = await snapshot();
    const state = await save({ action: 'set_target', targetDate: '2026-11-02' }, 'assigned');
    assert.equal(state.row.target, '2026-11-02');
    assert.equal(state.history.length, before.history.length);
    assert.ok(state.entries.some((e) => e.entry_type === 'public' && e.content === 'Target date changed to 2026-11-02.'));
  });
  await t.test('public and internal comments persist but the owner never receives internal notes or version metadata', async () => {
    await save({ action: 'update', message: 'Public progress note', visibility: 'public' }, 'assigned');
    await save({ action: 'update', message: 'PRIVATE staff progress note', visibility: 'internal' }, 'assigned');
    const owner = await (await get(`/requests/${requestId}`, 0)).json();
    assert.equal(owner.rowVersion, undefined);
    assert.ok(owner.timeline.some((e) => e.message === 'Public progress note'));
    assert.equal(owner.timeline.some((e) => e.visibility === 'internal'), false);
    assert.equal(JSON.stringify(owner).includes('PRIVATE'), false);
    const staff = await (await get(`/requests/${requestId}`)).json();
    assert.ok(staff.timeline.some((e) => e.message === 'PRIVATE staff progress note'));
  });
  await t.test('progress, hold, resume, resolution and closure append each status change', async () => {
    await save({ action: 'update', status: 'in_progress', message: 'PRIVATE work plan', visibility: 'internal' }, 'in_progress');
    const owner = await (await get(`/requests/${requestId}`, 0)).json();
    assert.equal(owner.status, 'in_progress');
    assert.ok(owner.timeline.some((e) => e.message === 'Status changed from assigned to in progress.'));
    assert.equal(JSON.stringify(owner).includes('PRIVATE work plan'), false);
    for (const status of ['on_hold', 'in_progress', 'resolved', 'closed']) {
      const before = await snapshot();
      const state = await save({ action: 'update', status, message: `Moving to ${status}`, visibility: 'public' }, status);
      assert.equal(state.history.length, before.history.length + 1);
    }
    assert.equal((await snapshot()).row.status, 'closed');
  });
  await t.test('closed requests reject updates and invalid reopen attempts without writes', async () => {
    const before = await snapshot();
    for (const body of [{ action: 'update', message: 'Change', visibility: 'public' }, { action: 'accept', targetDate: '2026-11-01' }]) {
      assert.equal((await post({ ...body, rowVersion: version })).status, 422);
    }
    assert.deepEqual(await snapshot(), before);
  });
  await t.test('rejection requires a reason and makes that reason public', async () => {
    const before = await snapshot(rejectionId);
    assert.equal((await post({ action: 'reject', reason: ' ', rowVersion: 1 }, rejectionId)).status, 422);
    assert.deepEqual(await snapshot(rejectionId), before);
    const response = await post({ action: 'reject', reason: '  Outside service scope  ', visibility: 'internal', rowVersion: 1 }, rejectionId);
    assert.equal(response.status, 200);
    const owner = await (await get(`/requests/${rejectionId}`, 0)).json();
    assert.equal(owner.status, 'rejected');
    assert.ok(owner.timeline.some((e) => e.message === 'Outside service scope' && e.visibility === 'public'));
  });
  await t.test('legacy status endpoint cannot bypass the new action rules', async () => {
    const before = await snapshot();
    const response = await fetch(`${base}/staff/requests/${requestId}/status`, {
      method: 'PUT', headers: headers(), body: JSON.stringify({ newStatus: 'submitted' }),
    });
    assert.equal(response.status, 410);
    assert.deepEqual(await snapshot(), before);
  });
});
