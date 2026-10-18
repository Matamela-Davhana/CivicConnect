const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const jwt = require('jsonwebtoken');
const { validateSubmission, submitRequest, ValidationError } = require('../../services/submit-request');
const categoryId = '11111111-1111-4111-8111-111111111111';
const valid = { categoryId, description: 'The light has stopped working.' };

for (const [name, body, field] of [
  ['missing body', undefined, 'category'], ['array body', [], 'category'],
  ['invalid category UUID', { ...valid, categoryId: 'wrong' }, 'category'],
  ['missing description', { categoryId }, 'description'],
  ['non-text description', { ...valid, description: {} }, 'description'],
  ['nine characters', { ...valid, description: 'x'.repeat(9) }, 'description'],
  ['over 1000 characters', { ...valid, description: 'x'.repeat(1001) }, 'description'],
  ['blank description', { ...valid, description: '  ' }, 'description'],
  ['non-text explanation', { ...valid, otherExplanation: [] }, 'otherExplanation'],
  ['overlong explanation', { ...valid, otherExplanation: 'x'.repeat(1001) }, 'otherExplanation'],
]) {
  test(`submission validation rejects ${name}`, () => {
    assert.throws(() => validateSubmission(body), (e) => e instanceof ValidationError && Boolean(e.errors[field]));
  });
}
for (const length of [10, 1000]) {
  test(`submission accepts trimmed description boundary ${length}`, () => {
    assert.equal(validateSubmission({ ...valid, description: `  ${'x'.repeat(length)}  ` }).description.length, length);
  });
}
test('normalization excludes client-supplied ownership and status', () => {
  assert.deepEqual(validateSubmission({ ...valid, requester_id: 'attacker', status: 'closed' }), { ...valid, otherExplanation: '' });
});

function database({ category = { id: categoryId, name: 'IT Support', active: true }, historyFailure = false, collisions = 0 } = {}) {
  const calls = [];
  let released = false;
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.startsWith('SELECT id, name, active')) return { rows: category ? [category] : [] };
      if (sql.includes('INSERT INTO service_requests')) {
        if (collisions-- > 0) throw Object.assign(new Error('collision'), { code: '23505', constraint: 'service_requests_reference_key' });
        return { rows: [{ id: categoryId, reference: params[0] }] };
      }
      if (sql.includes('INSERT INTO status_history') && historyFailure) throw new Error('private database diagnostic');
      return { rows: [] };
    },
    release() { released = true; },
  };
  return { calls, get released() { return released; }, connect: async () => client };
}
test('submission commits request and initial history with server-controlled owner/status', async () => {
  const db = database();
  const row = await submitRequest(db, { ...valid, otherExplanation: 'irrelevant' }, 'signed-in-owner');
  assert.match(row.reference, /^CC-[A-F0-9]{16}$/);
  const insert = db.calls.find((c) => c.sql.includes('INSERT INTO service_requests'));
  assert.deepEqual(insert.params.slice(1), [categoryId, valid.description, null, 'signed-in-owner']);
  assert.match(insert.sql, /'submitted'/);
  assert.ok(db.calls.some((c) => c.sql.includes('INSERT INTO status_history')));
  assert.equal(db.calls.at(-1).sql, 'COMMIT');
  assert.equal(db.released, true);
});
for (const category of [null, { id: categoryId, name: 'IT Support', active: false }, { id: categoryId, name: 'Other', active: true }]) {
  test('invalid/inactive category or missing Other explanation rolls back without inserting', async () => {
    const db = database({ category });
    await assert.rejects(submitRequest(db, valid, 'owner'), ValidationError);
    assert.equal(db.calls.at(-1).sql, 'ROLLBACK');
    assert.equal(db.calls.some((c) => c.sql.includes('INSERT INTO service_requests')), false);
    assert.equal(db.released, true);
  });
}
test('history failure rolls back the request and releases the connection', async () => {
  const db = database({ historyFailure: true });
  await assert.rejects(submitRequest(db, valid, 'owner'));
  assert.equal(db.calls.some((c) => c.sql === 'COMMIT'), false);
  assert.equal(db.calls.at(-1).sql, 'ROLLBACK');
  assert.equal(db.released, true);
});
test('reference collision retries a fresh transaction and is bounded', async () => {
  const db = database({ collisions: 1 });
  await submitRequest(db, valid, 'owner');
  assert.equal(db.calls.filter((c) => c.sql === 'BEGIN').length, 2);
  assert.equal(db.calls.filter((c) => c.sql === 'ROLLBACK').length, 1);
  const always = database({ collisions: 5 });
  await assert.rejects(submitRequest(always, valid, 'owner'));
  assert.equal(always.calls.filter((c) => c.sql === 'BEGIN').length, 3);
  assert.equal(always.released, true);
});

test('category and submission HTTP contracts with a database stub', async (t) => {
  const dbPath = require.resolve('../../db');
  const previous = require.cache[dbPath];
  const secret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'disposable-submission-contract-only';
  let db = database();
  let categoryFailure = false;
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
    connect: () => db.connect(),
    async query(sql) {
      assert.match(sql, /WHERE active = true ORDER BY name ASC, id ASC/);
      if (categoryFailure) throw new Error('private diagnostic');
      return { rows: [{ id: categoryId, name: 'IT Support', isOther: false }] };
    },
  } };
  const server = require('../../server').listen(0, '127.0.0.1');
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    if (previous) require.cache[dbPath] = previous; else delete require.cache[dbPath];
    if (secret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = secret;
  });
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const headers = (role) => ({ 'Content-Type': 'application/json', ...(role ? {
    Authorization: `Bearer ${jwt.sign({ id: categoryId, role }, process.env.JWT_SECRET)}` } : {}) });
  const post = (body, role = 'requester') => fetch(`${base}/requests`, { method: 'POST', headers: headers(role), body: JSON.stringify(body) });
  await t.test('active category response matches the frontend', async () => {
    const response = await fetch(`${base}/categories`, { headers: headers('requester') });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), [{ id: categoryId, name: 'IT Support', isOther: false }]);
    assert.equal((await fetch(`${base}/categories`)).status, 401);
  });
  await t.test('create returns only id/reference and status 201', async () => {
    const response = await post(valid);
    assert.equal(response.status, 201);
    assert.deepEqual(Object.keys(await response.json()).sort(), ['id', 'reference']);
  });
  await t.test('field errors use the form element IDs', async () => {
    const response = await post({});
    assert.equal(response.status, 422);
    assert.deepEqual(Object.keys((await response.json()).errors).sort(), ['category', 'description']);
  });
  for (const role of [null, 'staff', 'management', 'admin']) {
    await t.test(`${role || 'anonymous'} cannot submit`, async () => {
      const before = db.calls.length;
      assert.equal((await post(valid, role)).status, role ? 403 : 401);
      assert.equal(db.calls.length, before);
    });
  }
  await t.test('malformed JSON returns safe JSON rather than an HTML stack trace', async () => {
    const response = await fetch(`${base}/requests`, { method: 'POST', headers: headers('requester'), body: '{bad' });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { message: 'Send a valid JSON object.' });
  });
  await t.test('database failures return generic submission/category messages', async () => {
    db = database({ historyFailure: true });
    const response = await post(valid);
    assert.equal(response.status, 500);
    assert.equal(JSON.stringify(await response.json()).includes('private diagnostic'), false);
    categoryFailure = true;
    const categories = await fetch(`${base}/categories`, { headers: headers('requester') });
    assert.equal(categories.status, 500);
    assert.deepEqual(await categories.json(), { message: 'Could not load categories. Please try again.' });
  });
});
