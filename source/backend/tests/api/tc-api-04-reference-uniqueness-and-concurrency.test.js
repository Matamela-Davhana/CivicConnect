const contract = require('../helpers/contract');
const db = require('../helpers/db');
const { actor } = require('../helpers/api');

const { routes, http } = contract;

describe('TC-API-04 NFR-007 / FR-010 / AC-NFR-007: unique references under concurrency and optimistic locking', () => {
  let app;
  let requester;
  let staffA;
  let staffB;

  beforeAll(() => {
    app = contract.loadApp();
  });

  beforeEach(async () => {
    await db.resetData();
    requester = await db.seedUser('requester');
    staffA = await db.seedUser('staff');
    staffB = await db.seedUser('staff');
  });

  afterAll(async () => {
    await db.closePool();
  });

  it('issues a distinct reference to each of 25 simultaneous submissions', async () => {
    const client = await actor(app, requester);
    const submissions = Array.from({ length: 25 }, (_, i) =>
      client.post(routes.requests(), { category: 'IT Support', description: `Concurrent submission ${i}` })
    );

    const results = await Promise.all(submissions);

    expect(results.every((r) => r.status === http.created)).toBe(true);
    const references = results.map((r) => r.body.reference);
    expect(new Set(references).size).toBe(25);
    expect(await db.countRequests()).toBe(25);
    const duplicates = await db.query(
      'SELECT reference FROM service_requests GROUP BY reference HAVING count(*) > 1'
    );
    expect(duplicates.rows).toHaveLength(0);
  });

  it('lets exactly one of two simultaneous acceptances win and reports the other as a stale version', async () => {
    const request = await db.insertRequest({ requesterId: requester.id });
    const clientA = await actor(app, staffA);
    const clientB = await actor(app, staffB);
    const payload = { targetResolutionDate: contract.isoDate(7), rowVersion: request.row_version };

    const [a, b] = await Promise.all([
      clientA.post(routes.accept(request.id), payload),
      clientB.post(routes.accept(request.id), payload)
    ]);

    expect([a.status, b.status].sort()).toEqual([http.ok, http.staleVersion]);
    const row = await db.getRequestRow(request.id);
    expect(row.status).toBe('accepted');
    expect(row.row_version).toBe(request.row_version + 1);
    expect(await db.historyFor(request.id)).toHaveLength(1);
  });

  it('rejects an acceptance that carries a stale row version without altering the request', async () => {
    const request = await db.insertRequest({ requesterId: requester.id });
    const client = await actor(app, staffA);

    const res = await client.post(routes.accept(request.id), {
      targetResolutionDate: contract.isoDate(7),
      rowVersion: request.row_version + 5
    });

    expect(res.status).toBe(http.staleVersion);
    const row = await db.getRequestRow(request.id);
    expect(row.status).toBe('submitted');
    expect(row.row_version).toBe(request.row_version);
  });

  it('rejects acceptance without a target resolution date and stores nothing', async () => {
    const request = await db.insertRequest({ requesterId: requester.id });
    const client = await actor(app, staffA);

    const res = await client.post(routes.accept(request.id), { rowVersion: request.row_version });

    expect(res.status).toBe(http.badRequest);
    const row = await db.getRequestRow(request.id);
    expect(row.status).toBe('submitted');
    expect(row.target_resolution_date).toBeNull();
    expect(row.row_version).toBe(request.row_version);
  });

  it('rejects assignment without a target resolution date and leaves the request unassigned', async () => {
    const request = await db.insertRequest({ requesterId: requester.id, status: 'accepted' });
    const client = await actor(app, staffA);

    const res = await client.post(routes.assign(request.id), {
      assigneeId: staffA.id,
      rowVersion: request.row_version
    });

    expect(res.status).toBe(http.badRequest);
    const row = await db.getRequestRow(request.id);
    expect(row.status).toBe('accepted');
    expect(row.assignee_id).toBeNull();
    expect(await db.historyFor(request.id)).toHaveLength(0);
  });
});
