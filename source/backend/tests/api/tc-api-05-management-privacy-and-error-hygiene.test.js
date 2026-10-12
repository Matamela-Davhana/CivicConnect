const contract = require('../helpers/contract');
const db = require('../helpers/db');
const { actor } = require('../helpers/api');

const { routes, http } = contract;

const HIDDEN_DESCRIPTION = 'Alarm panel shows tamper fault ref HD7731';
const HIDDEN_INTERNAL = 'Suspect insider access ref HI5520';

describe('TC-API-05 NFR-002 / FR-015 / RD-02 / AC-NFR-002 / AC-FR-015: privacy of management views and error responses', () => {
  let app;
  let requester;
  let staff;
  let management;
  let request;

  beforeAll(() => {
    app = contract.loadApp();
  });

  beforeEach(async () => {
    await db.removeHistoryFailureTrigger();
    await db.resetData();
    requester = await db.seedUser('requester', { name: 'Private Requester Name' });
    staff = await db.seedUser('staff');
    management = await db.seedUser('management');
    request = await db.insertRequest({
      requesterId: requester.id,
      category: 'Security Concern',
      description: HIDDEN_DESCRIPTION,
      status: 'in_progress',
      assigneeId: staff.id,
      targetDate: contract.isoDate(5)
    });
    await db.insertEntry({ requestId: request.id, authorId: staff.id, entryType: 'internal', content: HIDDEN_INTERNAL });
    await db.insertEntry({ requestId: request.id, authorId: staff.id, entryType: 'public', content: 'We are investigating' });
  });

  afterEach(async () => {
    await db.removeHistoryFailureTrigger();
  });

  afterAll(async () => {
    await db.closePool();
  });

  it('shows management the operational fields by default', async () => {
    const client = await actor(app, management);
    const res = await client.get(routes.managementRequests());
    expect(res.status).toBe(http.ok);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toEqual(
      expect.objectContaining({
        reference: request.reference,
        category: 'Security Concern',
        status: 'in_progress'
      })
    );
    expect(res.body.items[0]).toHaveProperty('assignee');
    expect(res.body.items[0]).toHaveProperty('targetResolutionDate');
  });

  it.each([
    ['list', routes.managementRequests],
    ['summary', routes.managementSummary]
  ])('keeps requester identity, description and internal comments out of the management %s', async (_label, route) => {
    const client = await actor(app, management);
    const res = await client.get(route());
    expect(res.status).toBe(http.ok);
    const body = res.text;
    expect(body).not.toContain(HIDDEN_DESCRIPTION);
    expect(body).not.toContain(HIDDEN_INTERNAL);
    expect(body).not.toContain(requester.email);
    expect(body).not.toContain('Private Requester Name');
    expect(body).not.toContain(requester.id);
  });

  it('does not leak internals, SQL, stack traces or request content when a write fails server-side', async () => {
    await db.installHistoryFailureTrigger();
    const client = await actor(app, staff);

    const res = await client.post(routes.status(request.id), {
      status: 'resolved',
      resolution: 'Done',
      rowVersion: request.row_version
    });

    expect(res.status).toBe(http.serverError);
    expect(res.text).not.toMatch(/forced history failure|status_history|service_requests|INSERT|UPDATE|SELECT/i);
    expect(res.text).not.toMatch(/\bat\s+\S+\s+\(.+:\d+:\d+\)/);
    expect(res.text).not.toContain(HIDDEN_DESCRIPTION);
    expect(res.text).not.toContain(HIDDEN_INTERNAL);
  });

  it('returns a clean not-found without internals for an unknown identifier', async () => {
    const client = await actor(app, staff);
    const res = await client.get(routes.request('00000000-0000-0000-0000-000000000000'));
    expect(res.status).toBe(http.notFound);
    expect(res.text).not.toMatch(/stack|node_modules|SELECT|pg_/i);
  });
});
