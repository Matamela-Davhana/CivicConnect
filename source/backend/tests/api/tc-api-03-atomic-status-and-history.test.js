const contract = require('../helpers/contract');
const db = require('../helpers/db');
const { actor } = require('../helpers/api');

const { routes, http } = contract;

describe('TC-API-03 NFR-007 / NFR-008 / FR-017 / AC-NFR-007: a status change and its history entry commit together or not at all', () => {
  let app;
  let requester;
  let staff;
  let client;
  let request;

  beforeAll(() => {
    app = contract.loadApp();
  });

  beforeEach(async () => {
    await db.removeHistoryFailureTrigger();
    await db.resetData();
    requester = await db.seedUser('requester');
    staff = await db.seedUser('staff');
    client = await actor(app, staff);
    request = await db.insertRequest({
      requesterId: requester.id,
      status: 'in_progress',
      assigneeId: staff.id,
      targetDate: contract.isoDate(7)
    });
  });

  afterEach(async () => {
    await db.removeHistoryFailureTrigger();
  });

  afterAll(async () => {
    await db.closePool();
  });

  it('commits both the new status and exactly one matching history row when nothing fails', async () => {
    const res = await client.post(routes.status(request.id), {
      status: 'resolved',
      resolution: 'Cable replaced',
      rowVersion: request.row_version
    });
    expect(res.status).toBe(http.ok);
    const row = await db.getRequestRow(request.id);
    expect(row.status).toBe('resolved');
    const history = await db.historyFor(request.id);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ old_status: 'in_progress', new_status: 'resolved', changed_by: staff.id });
  });

  it('rolls back the status and version when the history write fails, leaving no partial data', async () => {
    await db.installHistoryFailureTrigger();

    const res = await client.post(routes.status(request.id), {
      status: 'resolved',
      resolution: 'Cable replaced',
      rowVersion: request.row_version
    });

    expect(res.status).toBe(http.serverError);
    const row = await db.getRequestRow(request.id);
    expect(row.status).toBe('in_progress');
    expect(row.row_version).toBe(request.row_version);
    expect(await db.historyFor(request.id)).toHaveLength(0);
  });

  it('allows the same change to succeed afterwards, showing the failed attempt left no residue', async () => {
    await db.installHistoryFailureTrigger();
    await client.post(routes.status(request.id), {
      status: 'resolved',
      resolution: 'Cable replaced',
      rowVersion: request.row_version
    });
    await db.removeHistoryFailureTrigger();

    const retry = await client.post(routes.status(request.id), {
      status: 'resolved',
      resolution: 'Cable replaced',
      rowVersion: request.row_version
    });

    expect(retry.status).toBe(http.ok);
    expect(await db.historyFor(request.id)).toHaveLength(1);
  });
});
