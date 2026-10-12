const contract = require('../helpers/contract');
const db = require('../helpers/db');
const { actor } = require('../helpers/api');

const { routes, http } = contract;

describe('TC-BB-04 FR-008 / FR-015 / FR-016 (BVA): overdue boundary through staff filter and management totals', () => {
  let app;
  let staff;
  let management;
  let created;

  beforeAll(() => {
    app = contract.loadApp();
  });

  beforeEach(async () => {
    await db.resetData();
    const requester = await db.seedUser('requester');
    staff = await db.seedUser('staff');
    management = await db.seedUser('management');

    const make = (label, status, offset) =>
      db.insertRequest({
        requesterId: requester.id,
        description: `Boundary case ${label}`,
        status,
        assigneeId: staff.id,
        targetDate: contract.isoDate(offset)
      });

    created = {
      yesterday: await make('yesterday', 'in_progress', -1),
      today: await make('today', 'in_progress', 0),
      tomorrow: await make('tomorrow', 'in_progress', 1),
      resolvedPast: await make('resolved-past', 'resolved', -1)
    };
  });

  afterAll(async () => {
    await db.closePool();
  });

  const refs = (res) => res.body.items.map((i) => i.reference).sort();

  it('staff overdue filter returns only the request whose target date is before today', async () => {
    const client = await actor(app, staff);
    const res = await client.get(`${routes.staffRequests()}?overdue=true`);
    expect(res.status).toBe(http.ok);
    expect(refs(res)).toEqual([created.yesterday.reference]);
  });

  it('staff not-overdue filter returns today, tomorrow and the resolved request', async () => {
    const client = await actor(app, staff);
    const res = await client.get(`${routes.staffRequests()}?overdue=false`);
    expect(res.status).toBe(http.ok);
    expect(refs(res)).toEqual(
      [created.today.reference, created.tomorrow.reference, created.resolvedPast.reference].sort()
    );
  });

  it('management totals equal the underlying records at the boundary', async () => {
    const client = await actor(app, management);
    const res = await client.get(routes.managementSummary());
    expect(res.status).toBe(http.ok);
    expect(res.body.totals).toMatchObject({ open: 3, overdue: 1, resolved: 1, closed: 0 });
  });

  it('management filter by overdue produces totals equal to the filtered data set', async () => {
    const client = await actor(app, management);
    const res = await client.get(`${routes.managementSummary()}?overdue=true`);
    expect(res.status).toBe(http.ok);
    expect(res.body.totals.overdue).toBe(1);
    expect(res.body.totals.open).toBe(1);
    expect(res.body.totals.resolved).toBe(0);
  });
});
