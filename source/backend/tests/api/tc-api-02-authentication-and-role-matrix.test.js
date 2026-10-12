const request = require('supertest');
const contract = require('../helpers/contract');
const db = require('../helpers/db');
const { login, client } = require('../helpers/api');

const { routes, http } = contract;

describe('TC-API-02 FR-001 / NFR-001 / AC-FR-001 / AC-NFR-001 (negative): authentication and role enforcement', () => {
  let app;
  let users;
  let target;

  beforeAll(() => {
    app = contract.loadApp();
  });

  beforeEach(async () => {
    await db.resetData();
    users = {
      requester: await db.seedUser('requester'),
      staff: await db.seedUser('staff'),
      management: await db.seedUser('management')
    };
    target = await db.insertRequest({
      requesterId: users.requester.id,
      status: 'in_progress',
      assigneeId: users.staff.id,
      targetDate: contract.isoDate(7)
    });
  });

  afterAll(async () => {
    await db.closePool();
  });

  it('rejects a login with a wrong password and issues no token', async () => {
    const res = await request(app)
      .post(routes.login())
      .send({ email: users.staff.email, password: 'definitely-wrong' });
    expect(res.status).toBe(http.unauthenticated);
    expect(res.body.token).toBeUndefined();
  });

  it.each([
    ['no credentials', () => client(app, undefined)],
    ['a malformed token', () => client(app, 'not-a-real-token')]
  ])('denies a protected route with %s', async (_label, build) => {
    const res = await build().get(routes.myRequests());
    expect(res.status).toBe(http.unauthenticated);
  });

  it('denies a token whose signature has been altered', async () => {
    const token = await login(app, users.requester);
    const last = token.slice(-1);
    const tampered = token.slice(0, -1) + (last === 'a' ? 'b' : 'a');
    const res = await client(app, tampered).get(routes.myRequests());
    expect(res.status).toBe(http.unauthenticated);
  });

  const cases = [
    ['requester', 'changes request status', (c) => c.post(routes.status(target.id), { status: 'resolved', resolution: 'x', rowVersion: 1 })],
    ['requester', 'accepts a request', (c) => c.post(routes.accept(target.id), { targetResolutionDate: contract.isoDate(5), rowVersion: 1 })],
    ['requester', 'posts a staff entry', (c) => c.post(routes.entries(target.id), { entryType: 'internal', content: 'x' })],
    ['requester', 'lists the staff queue', (c) => c.get(routes.staffRequests())],
    ['requester', 'reads the management summary', (c) => c.get(routes.managementSummary())],
    ['management', 'changes request status', (c) => c.post(routes.status(target.id), { status: 'resolved', resolution: 'x', rowVersion: 1 })],
    ['management', 'posts an internal comment', (c) => c.post(routes.entries(target.id), { entryType: 'internal', content: 'x' })],
    ['staff', 'reads the management summary', (c) => c.get(routes.managementSummary())]
  ];

  test.each(cases)('denies %s who %s and leaves data unchanged', async (role, _action, perform) => {
    const token = await login(app, users[role]);
    const before = await db.getRequestRow(target.id);
    const res = await perform(client(app, token));
    expect(res.status).toBe(http.forbidden);
    const after = await db.getRequestRow(target.id);
    expect(after.status).toBe(before.status);
    expect(after.row_version).toBe(before.row_version);
    expect(await db.historyFor(target.id)).toHaveLength(0);
    const entries = await db.query('SELECT count(*)::int AS n FROM request_entries');
    expect(entries.rows[0].n).toBe(0);
  });

  it('allows the approved role for the same functions, proving the denials are role-based', async () => {
    const staffToken = await login(app, users.staff);
    const managementToken = await login(app, users.management);
    expect((await client(app, staffToken).get(routes.staffRequests())).status).toBe(http.ok);
    expect((await client(app, managementToken).get(routes.managementSummary())).status).toBe(http.ok);
  });
});
