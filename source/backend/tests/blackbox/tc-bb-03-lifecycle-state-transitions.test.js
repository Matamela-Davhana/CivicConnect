const contract = require('../helpers/contract');
const db = require('../helpers/db');
const { actor } = require('../helpers/api');

const { routes, http } = contract;

describe('TC-BB-03 FR-011 / FR-017 / AC-FR-011 / AC-FR-017 (state transition): lifecycle path and prohibited jump', () => {
  let app;
  let requester;
  let staff;
  let client;

  beforeAll(() => {
    app = contract.loadApp();
  });

  beforeEach(async () => {
    await db.resetData();
    requester = await db.seedUser('requester');
    staff = await db.seedUser('staff');
    client = await actor(app, staff);
  });

  afterAll(async () => {
    await db.closePool();
  });

  it('walks the full approved path and records every transition in order with the acting user', async () => {
    const request = await db.insertRequest({ requesterId: requester.id });
    let version = request.row_version;

    const accept = await client.post(routes.accept(request.id), {
      targetResolutionDate: contract.isoDate(10),
      rowVersion: version
    });
    expect(accept.status).toBe(http.ok);
    expect(accept.body.status).toBe('accepted');
    version = accept.body.rowVersion;

    const assign = await client.post(routes.assign(request.id), {
      assigneeId: staff.id,
      targetResolutionDate: contract.isoDate(10),
      rowVersion: version
    });
    expect(assign.status).toBe(http.ok);
    expect(assign.body.status).toBe('assigned');
    version = assign.body.rowVersion;

    const steps = [
      { status: 'in_progress' },
      { status: 'on_hold', reason: 'Waiting for parts' },
      { status: 'in_progress' },
      { status: 'resolved', resolution: 'Part fitted and tested' },
      { status: 'closed' }
    ];

    for (const step of steps) {
      const res = await client.post(routes.status(request.id), { ...step, rowVersion: version });
      expect(res.status).toBe(http.ok);
      expect(res.body.status).toBe(step.status);
      version = res.body.rowVersion;
    }

    const history = await db.historyFor(request.id);
    expect(history.map((h) => [h.old_status, h.new_status])).toEqual([
      ['submitted', 'accepted'],
      ['accepted', 'assigned'],
      ['assigned', 'in_progress'],
      ['in_progress', 'on_hold'],
      ['on_hold', 'in_progress'],
      ['in_progress', 'resolved'],
      ['resolved', 'closed']
    ]);
    expect(history.every((h) => h.changed_by === staff.id)).toBe(true);
    const times = history.map((h) => new Date(h.changed_at).getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it('rejects a prohibited jump from submitted to resolved and leaves the request unaltered', async () => {
    const request = await db.insertRequest({ requesterId: requester.id });

    const res = await client.post(routes.status(request.id), {
      status: 'resolved',
      resolution: 'Attempted shortcut',
      rowVersion: request.row_version
    });

    expect(res.status).toBe(http.invalidTransition);
    const row = await db.getRequestRow(request.id);
    expect(row.status).toBe('submitted');
    expect(row.row_version).toBe(request.row_version);
    expect(await db.historyFor(request.id)).toHaveLength(0);
  });

  it.each(['closed', 'rejected'])('refuses any further change once a request is %s', async (terminal) => {
    const request = await db.insertRequest({
      requesterId: requester.id,
      status: terminal,
      assigneeId: staff.id,
      targetDate: contract.isoDate(5)
    });

    const res = await client.post(routes.status(request.id), {
      status: 'in_progress',
      reason: 'Attempted reopen',
      rowVersion: request.row_version
    });

    expect(res.status).toBe(http.invalidTransition);
    expect((await db.getRequestRow(request.id)).status).toBe(terminal);
  });
});
