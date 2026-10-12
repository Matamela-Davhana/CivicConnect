const contract = require('../helpers/contract');
const db = require('../helpers/db');
const { call, login } = require('../helpers/http');

const { routes, http } = contract;

const PUBLIC_TEXT = 'E2E public update: technician allocated';
const INTERNAL_TEXT = 'E2E internal comment: do not disclose supplier pricing';

describe('TC-E2E-01 FR-002, FR-004, FR-006, FR-010, FR-011, FR-012, FR-014, FR-015, FR-017: submit to closure across the running system', () => {
  let requesterToken;
  let staffToken;
  let managementToken;
  let staff;
  let reference;
  let requestId;
  let version;

  beforeAll(async () => {
    await db.resetData();
    const requester = await db.seedUser('requester');
    staff = await db.seedUser('staff');
    const management = await db.seedUser('management');
    requesterToken = await login(requester);
    staffToken = await login(staff);
    managementToken = await login(management);
  });

  afterAll(async () => {
    await db.closePool();
  });

  it('completes the full lifecycle with every actor seeing only what their role allows', async () => {
    const submit = await call('POST', routes.requests(), {
      token: requesterToken,
      body: { category: 'Facility Fault', description: 'E2E: door closer on main entrance has failed' }
    });
    expect(submit.status).toBe(http.created);
    reference = submit.body.reference;
    requestId = submit.body.id;
    version = submit.body.rowVersion;
    expect(reference).toBeTruthy();
    expect(submit.body.status).toBe('submitted');

    const accept = await call('POST', routes.accept(requestId), {
      token: staffToken,
      body: { targetResolutionDate: contract.isoDate(14), rowVersion: version }
    });
    expect(accept.status).toBe(http.ok);
    version = accept.body.rowVersion;

    const assign = await call('POST', routes.assign(requestId), {
      token: staffToken,
      body: { assigneeId: staff.id, targetResolutionDate: contract.isoDate(14), rowVersion: version }
    });
    expect(assign.status).toBe(http.ok);
    version = assign.body.rowVersion;

    const publicEntry = await call('POST', routes.entries(requestId), {
      token: staffToken,
      body: { entryType: 'public', content: PUBLIC_TEXT }
    });
    const internalEntry = await call('POST', routes.entries(requestId), {
      token: staffToken,
      body: { entryType: 'internal', content: INTERNAL_TEXT }
    });
    expect(publicEntry.status).toBe(http.created);
    expect(internalEntry.status).toBe(http.created);

    for (const step of [{ status: 'in_progress' }, { status: 'resolved', resolution: 'Closer replaced and tested' }, { status: 'closed' }]) {
      const res = await call('POST', routes.status(requestId), { token: staffToken, body: { ...step, rowVersion: version } });
      expect(res.status).toBe(http.ok);
      version = res.body.rowVersion;
    }

    const mine = await call('GET', routes.myRequests(), { token: requesterToken });
    expect(mine.status).toBe(http.ok);
    expect(mine.body.items.find((i) => i.reference === reference).status).toBe('closed');

    const requesterTimeline = await call('GET', routes.timeline(requestId), { token: requesterToken });
    expect(requesterTimeline.status).toBe(http.ok);
    expect(requesterTimeline.body.entries.map((e) => e.content)).toContain(PUBLIC_TEXT);
    expect(requesterTimeline.body.entries.every((e) => e.entryType === 'public')).toBe(true);
    expect(requesterTimeline.text).not.toContain(INTERNAL_TEXT);
    expect(requesterTimeline.body.history.map((h) => h.newStatus)).toEqual([
      'accepted',
      'assigned',
      'in_progress',
      'resolved',
      'closed'
    ]);
    const times = requesterTimeline.body.history.map((h) => new Date(h.changedAt).getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);

    const staffTimeline = await call('GET', routes.timeline(requestId), { token: staffToken });
    expect(staffTimeline.body.entries.map((e) => e.content)).toEqual(expect.arrayContaining([PUBLIC_TEXT, INTERNAL_TEXT]));

    const summary = await call('GET', routes.managementSummary(), { token: managementToken });
    expect(summary.status).toBe(http.ok);
    expect(summary.body.totals).toMatchObject({ open: 0, closed: 1 });

    const managementList = await call('GET', routes.managementRequests(), { token: managementToken });
    expect(managementList.text).not.toContain(INTERNAL_TEXT);
    expect(managementList.text).not.toContain('door closer on main entrance');

    const row = await db.getRequestRow(requestId);
    expect(row.status).toBe('closed');
    expect(row.target_resolution_date).not.toBeNull();
    expect(await db.historyFor(requestId)).toHaveLength(5);
  });
});
