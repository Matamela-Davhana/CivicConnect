const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const jwt = require('jsonwebtoken');
const { validateAction, validDate, applyStaffAction, StaffActionError } = require('../../services/staff-actions');
const id = '11111111-1111-4111-8111-111111111111';
const staffId = '22222222-2222-4222-8222-222222222222';
const accept = { action: 'accept', rowVersion: 1, targetDate: '2026-11-01' };

test('staff input boundaries', async (t) => {
  for (const body of [null, [], {}, { ...accept, rowVersion: '1' }, { ...accept, rowVersion: 0 },
    { ...accept, rowVersion: 1.5 }, { ...accept, rowVersion: 2147483647 }, { ...accept, action: 'unknown' },
    { ...accept, targetDate: '2026-02-29' }, { ...accept, targetDate: '' },
    { action: 'assign', rowVersion: 1, assigneeId: 'bad' },
    { action: 'reject', rowVersion: 1, reason: '   ' },
    { action: 'reject', rowVersion: 1, reason: 'x'.repeat(1001) },
    { action: 'update', rowVersion: 1, message: {}, visibility: 'public' },
    { action: 'update', rowVersion: 1, message: 'hello', visibility: 'everyone' },
    { action: 'update', rowVersion: 1, message: 'hello', visibility: 'public', status: 'completed' },
  ]) assert.throws(() => validateAction(body), (e) => e instanceof StaffActionError && e.status === 422);
  await t.test('calendar dates reject rollover and accept leap years', () => {
    for (const value of ['2026-04-31', '0000-01-01', '26-01-01', '2026-1-01', '2026-13-01', '2026-01-00', null]) assert.equal(validDate(value), false);
    assert.equal(validDate('2028-02-29'), true);
  });
  assert.equal(validateAction({ action: 'reject', rowVersion: 1, reason: ' x ', visibility: 'internal' }).visibility, 'public');
  assert.equal(validateAction({ action: 'reject', rowVersion: 1, reason: 'x'.repeat(1000) }).message.length, 1000);
  assert.equal(validateAction({ action: 'update', rowVersion: 1, message: ' x ', visibility: 'internal' }).message, 'x');
});

function fakeDb(status = 'submitted', options = {}) {
  const calls = [];
  const row = { id, status, row_version: 1, assignee_id: status === 'submitted' || status === 'accepted' ? null : staffId,
    target_date: status === 'submitted' ? null : '2026-10-20', ...options.row };
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (options.fail && sql.includes(options.fail)) throw new Error('private SQL diagnostic');
      if (sql.startsWith('SELECT id, status')) return { rows: options.missing ? [] : [row] };
      if (sql.startsWith('SELECT id, name')) return { rows: options.noStaff ? [] : [{ id: staffId, name: 'Fixture staff' }] };
      if (sql.startsWith('UPDATE')) {
        assert.match(sql, /WHERE id=\$4 AND row_version=\$5/);
        return { rows: options.race ? [] : [{ id, status: params[0], rowVersion: 2 }] };
      }
      return { rows: [] };
    },
    release() { calls.push({ sql: 'RELEASE' }); },
  };
  return { calls, connect: async () => client };
}

test('staff actions transaction contract (database stub)', async (t) => {
  for (const [status, body, next, visibility] of [
    ['submitted', accept, 'accepted', 'public'],
    ['submitted', { action: 'reject', reason: 'Not a municipal service', rowVersion: 1 }, 'rejected', 'public'],
    ['accepted', { action: 'assign', assigneeId: staffId, rowVersion: 1 }, 'assigned', 'internal'],
    ['in_progress', { action: 'assign', assigneeId: staffId, rowVersion: 1 }, 'in_progress', 'internal'],
    ['accepted', { action: 'set_target', targetDate: '2026-11-02', rowVersion: 1 }, 'accepted', 'public'],
    ['assigned', { action: 'update', status: 'in_progress', message: 'Started', visibility: 'public', rowVersion: 1 }, 'in_progress', 'public'],
    ['in_progress', { action: 'update', status: 'on_hold', message: 'Waiting for parts', visibility: 'internal', rowVersion: 1 }, 'on_hold', 'internal'],
    ['on_hold', { action: 'update', status: 'in_progress', message: 'Parts received', visibility: 'public', rowVersion: 1 }, 'in_progress', 'public'],
    ['in_progress', { action: 'update', status: 'resolved', message: 'Repaired', visibility: 'public', rowVersion: 1 }, 'resolved', 'public'],
    ['resolved', { action: 'update', status: 'closed', message: 'Resolution confirmed', visibility: 'public', rowVersion: 1 }, 'closed', 'public'],
    ['assigned', { action: 'update', message: 'Internal note', visibility: 'internal', rowVersion: 1 }, 'assigned', 'internal'],
  ]) await t.test(`${status}: ${body.action} -> ${next} with atomic audit`, async () => {
    const db = fakeDb(status);
    assert.deepEqual(await applyStaffAction(db, id, body, staffId), { id, status: next, rowVersion: 2 });
    const history = db.calls.filter((c) => c.sql.includes('INSERT INTO status_history'));
    assert.equal(history.length, next === status ? 0 : 1);
    if (history.length) assert.deepEqual(history[0].params, [id, status, next, staffId]);
    const entry = db.calls.find((c) => c.sql.includes('INSERT INTO request_entries'));
    assert.deepEqual(entry.params.slice(0, 3), [id, visibility, staffId]);
    assert.equal(db.calls[0].sql, 'BEGIN');
    assert.deepEqual(db.calls.slice(-2).map((c) => c.sql), ['COMMIT', 'RELEASE']);
  });
  for (const [name, status, body, options, expected] of [
    ['stale version', 'submitted', accept, { row: { row_version: 2 } }, 409],
    ['concurrent winner', 'submitted', accept, { race: true }, 409],
    ['missing request', 'submitted', accept, { missing: true }, 404],
    ['already accepted', 'accepted', accept, {}, 422],
    ['cannot reject active', 'assigned', { action: 'reject', reason: 'No', rowVersion: 1 }, {}, 422],
    ['cannot skip assignment', 'accepted', { action: 'update', status: 'in_progress', message: 'Start', visibility: 'public', rowVersion: 1 }, {}, 422],
    ['cannot skip resolution', 'in_progress', { action: 'update', status: 'closed', message: 'Close', visibility: 'public', rowVersion: 1 }, {}, 422],
    ['terminal closed', 'closed', { action: 'update', message: 'Change', visibility: 'public', rowVersion: 1 }, {}, 422],
    ['terminal rejected', 'rejected', accept, {}, 422],
    ['assignee wrong role', 'accepted', { action: 'assign', assigneeId: staffId, rowVersion: 1 }, { noStaff: true }, 422],
    ['missing target', 'accepted', { action: 'assign', assigneeId: staffId, rowVersion: 1 }, { row: { target_date: null } }, 422],
    ['missing assignee', 'assigned', { action: 'update', status: 'in_progress', message: 'Start', visibility: 'public', rowVersion: 1 }, { row: { assignee_id: null } }, 422],
  ]) await t.test(`${name} rolls back without audit writes`, async () => {
    const db = fakeDb(status, options);
    await assert.rejects(applyStaffAction(db, id, body, staffId), (e) => e.status === expected);
    assert.equal(db.calls.some((c) => c.sql.startsWith('INSERT')), false);
    assert.deepEqual(db.calls.slice(-2).map((c) => c.sql), ['ROLLBACK', 'RELEASE']);
  });
  for (const fail of ['UPDATE', 'INSERT INTO status_history', 'INSERT INTO request_entries']) {
    await t.test(`${fail} failure rolls back and releases`, async () => {
      const db = fakeDb('submitted', { fail });
      await assert.rejects(applyStaffAction(db, id, accept, staffId));
      assert.deepEqual(db.calls.slice(-2).map((c) => c.sql), ['ROLLBACK', 'RELEASE']);
      assert.equal(db.calls.some((c) => c.sql === 'COMMIT'), false);
    });
  }
});

test('staff HTTP routes reject non-staff, validate filters and hide diagnostics', async (t) => {
  require('../helpers/stub-account-sessions.cjs').stubAccountSessions(t);
  const dbPath = require.resolve('../../db');
  const previous = require.cache[dbPath];
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'disposable-staff-contract-only';
  let calls = [];
  let fail = false;
  let queuePayload = '[]';
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
    async query(sql, params) {
      calls.push({ sql, params });
      if (fail) throw new Error('private SQL diagnostic');
      return { rows: sql.includes('json_agg(queue)') ? [{ payload: queuePayload }] : [] };
    },
    async connect() { throw new Error('private connection diagnostic'); },
  } };
  const server = require('../../server').listen(0, '127.0.0.1');
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    if (previous) require.cache[dbPath] = previous; else delete require.cache[dbPath];
    if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret;
  });
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const request = (path, role = 'staff', method = 'GET', body) => fetch(base + path, { method,
    headers: { 'Content-Type': 'application/json', ...(role ? { Authorization: `Bearer ${jwt.sign({ id: staffId, role }, process.env.JWT_SECRET)}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  for (const role of [null, 'requester', 'management', 'admin']) await t.test(`${role || 'anonymous'} denied on every staff endpoint`, async () => {
    const before = calls.length;
    for (const [path, method] of [['/staff/requests', 'GET'], ['/staff/assignees', 'GET'], [`/requests/${id}/actions`, 'POST'], [`/staff/requests/${id}/status`, 'PUT']]) {
      assert.equal((await request(path, role, method, method === 'GET' ? undefined : accept)).status, role ? 403 : 401);
    }
    assert.equal(calls.length, before);
  });
  await t.test('queue uses explicit fields, literal reference search and camelCase filters', async () => {
    const response = await request(`/staff/requests?status=assigned&category=${id}&q=%25%27`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), []);
    const call = calls.at(-1);
    assert.deepEqual(call.params, ['assigned', id, "%'"]);
    assert.match(call.sql, /strpos\(lower\(r.reference\), lower\(\$3::text\)\)/);
    assert.match(call.sql, /ORDER BY r.submitted_at DESC, r.id DESC/);
    assert.doesNotMatch(call.sql, /SELECT \*|password_hash|email/);
    assert.match(call.sql, /COALESCE\(json_agg\(queue\), '\[\]'::json\)::text AS payload/);
  });
  await t.test('pre-encoded queue is JSON, not a double-encoded string or HTML', async () => {
    const rows = [{ id, reference: 'T-quote', category: 'Other', status: 'submitted',
      createdAt: '2026-10-18T12:34:56.123Z', targetDate: null,
      requester: { id: staffId, name: 'Quote " slash \\ newline\n <script> & café' }, assignee: null }];
    queuePayload = JSON.stringify(rows);
    try {
      const response = await request('/staff/requests');
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type'), /^application\/json; charset=utf-8$/);
      assert.equal(await response.text(), queuePayload);
    } finally { queuePayload = '[]'; }
  });
  await t.test('invalid filters do not reach SQL', async () => {
    const before = calls.length;
    for (const query of ['status=completed', 'category=not-uuid', 'status=accepted&status=assigned', `q=${'x'.repeat(101)}`]) {
      assert.equal((await request(`/staff/requests?${query}`)).status, 422);
    }
    assert.equal(calls.length, before);
  });
  await t.test('assignee lookup selects staff and only id/name', async () => {
    assert.equal((await request('/staff/assignees')).status, 200);
    assert.equal(calls.at(-1).sql, "SELECT id, name FROM users WHERE role='staff' AND active=true ORDER BY name, id");
  });
  await t.test('legacy status write cannot bypass concurrency protection', async () => {
    const before = calls.length;
    assert.equal((await request(`/staff/requests/${id}/status`, 'staff', 'PUT', { newStatus: 'closed' })).status, 410);
    assert.equal(calls.length, before);
  });
  await t.test('bad action and invalid ID have safe validation/not-found responses', async () => {
    assert.equal((await request(`/requests/${id}/actions`, 'staff', 'POST', {})).status, 422);
    assert.equal((await request('/requests/bad/actions', 'staff', 'POST', accept)).status, 404);
  });
  await t.test('database failures do not expose SQL or connection details', async () => {
    fail = true;
    for (const [path, method] of [['/staff/requests', 'GET'], ['/staff/assignees', 'GET'], [`/requests/${id}/actions`, 'POST']]) {
      const response = await request(path, 'staff', method, method === 'POST' ? accept : undefined);
      assert.equal(response.status, 500);
      assert.doesNotMatch(JSON.stringify(await response.json()), /private|diagnostic/);
    }
  });
});
