const contract = require('../helpers/contract');
const db = require('../helpers/db');
const { call, login } = require('../helpers/http');

const { routes, http } = contract;

const REJECTION_REASON = 'This duplicates request already being handled by Facilities';
const TRIAGE_NOTE = 'E2E internal triage note: possible repeat reporter';

describe('TC-E2E-02 FR-006, FR-011, FR-012, FR-014, NFR-001 (negative): rejection journey and access boundaries across the running system', () => {
  let requesterToken;
  let otherRequesterToken;
  let staffToken;
  let requestId;
  let version;

  beforeAll(async () => {
    await db.resetData();
    const requester = await db.seedUser('requester');
    const otherRequester = await db.seedUser('requester');
    const staff = await db.seedUser('staff');
    requesterToken = await login(requester);
    otherRequesterToken = await login(otherRequester);
    staffToken = await login(staff);
  });

  afterAll(async () => {
    await db.closePool();
  });

  it('rejects a request with a requester-visible reason and keeps the outcome final and private to its owner', async () => {
    const submit = await call('POST', routes.requests(), {
      token: requesterToken,
      body: { category: 'Maintenance', description: 'E2E: corridor light out near stairwell' }
    });
    expect(submit.status).toBe(http.created);
    requestId = submit.body.id;
    version = submit.body.rowVersion;

    const triage = await call('POST', routes.entries(requestId), {
      token: staffToken,
      body: { entryType: 'internal', content: TRIAGE_NOTE }
    });
    expect(triage.status).toBe(http.created);

    const noReason = await call('POST', routes.status(requestId), {
      token: staffToken,
      body: { status: 'rejected', rowVersion: version }
    });
    expect(noReason.status).toBe(http.badRequest);

    const reject = await call('POST', routes.status(requestId), {
      token: staffToken,
      body: { status: 'rejected', reason: REJECTION_REASON, rowVersion: version }
    });
    expect(reject.status).toBe(http.ok);
    expect(reject.body.status).toBe('rejected');
    version = reject.body.rowVersion;

    const timeline = await call('GET', routes.timeline(requestId), { token: requesterToken });
    expect(timeline.status).toBe(http.ok);
    expect(timeline.text).toContain(REJECTION_REASON);
    expect(timeline.text).not.toContain(TRIAGE_NOTE);
    expect(timeline.body.history.map((h) => h.newStatus)).toEqual(['rejected']);

    const reopen = await call('POST', routes.status(requestId), {
      token: staffToken,
      body: { status: 'accepted', rowVersion: version }
    });
    expect(reopen.status).toBe(http.invalidTransition);

    const intruder = await call('GET', routes.request(requestId), { token: otherRequesterToken });
    expect([http.forbidden, http.notFound]).toContain(intruder.status);
    expect(intruder.text).not.toContain(REJECTION_REASON);

    const anonymous = await call('GET', routes.timeline(requestId), {});
    expect(anonymous.status).toBe(http.unauthenticated);

    const row = await db.getRequestRow(requestId);
    expect(row.status).toBe('rejected');
    expect(await db.historyFor(requestId)).toHaveLength(1);
  });
});
