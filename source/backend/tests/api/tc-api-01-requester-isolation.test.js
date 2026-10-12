const contract = require('../helpers/contract');
const db = require('../helpers/db');
const { actor } = require('../helpers/api');

const { routes, http } = contract;

describe('TC-API-01 FR-004 / FR-005 / NFR-001 / AC-FR-004 (negative): a requester cannot reach another requester\'s data', () => {
  let app;
  let alice;
  let bob;
  let aliceRequest;
  let bobRequest;
  let aliceClient;

  beforeAll(() => {
    app = contract.loadApp();
  });

  beforeEach(async () => {
    await db.resetData();
    alice = await db.seedUser('requester', { name: 'Alice Requester' });
    bob = await db.seedUser('requester', { name: 'Bob Requester' });
    aliceRequest = await db.insertRequest({ requesterId: alice.id, description: 'Alice leaking tap in kitchen' });
    bobRequest = await db.insertRequest({ requesterId: bob.id, description: 'Bob confidential security concern' });
    aliceClient = await actor(app, alice);
  });

  afterAll(async () => {
    await db.closePool();
  });

  it('lets a requester open their own request and see only their own history', async () => {
    const own = await aliceClient.get(routes.request(aliceRequest.id));
    expect(own.status).toBe(http.ok);
    expect(own.body.reference).toBe(aliceRequest.reference);

    const history = await aliceClient.get(routes.myRequests());
    expect(history.status).toBe(http.ok);
    expect(history.body.items.map((i) => i.reference)).toEqual([aliceRequest.reference]);
    expect(history.body.items[0]).toEqual(
      expect.objectContaining({
        reference: expect.any(String),
        category: expect.any(String),
        status: 'submitted',
        submittedAt: expect.anything()
      })
    );
  });

  it('denies direct identifier access to another requester\'s request without leaking its content', async () => {
    const res = await aliceClient.get(routes.request(bobRequest.id));
    expect([http.forbidden, http.notFound]).toContain(res.status);
    expect(res.text).not.toContain('Bob confidential security concern');
    expect(res.text).not.toContain(bobRequest.reference);
  });

  it('denies access to another requester\'s timeline', async () => {
    const res = await aliceClient.get(routes.timeline(bobRequest.id));
    expect([http.forbidden, http.notFound]).toContain(res.status);
  });

  it('does not surface another requester\'s reference through the search parameter', async () => {
    const res = await aliceClient.get(`${routes.myRequests()}?q=${encodeURIComponent(bobRequest.reference)}`);
    expect(res.status).toBe(http.ok);
    expect(res.body.items).toEqual([]);
    expect(res.text).not.toContain('Bob confidential security concern');
  });

  it('returns the same denial shape for a non-existent identifier as for a foreign one', async () => {
    const missing = await aliceClient.get(routes.request('00000000-0000-0000-0000-000000000000'));
    const foreign = await aliceClient.get(routes.request(bobRequest.id));
    expect([http.forbidden, http.notFound]).toContain(missing.status);
    expect(missing.status).toBe(foreign.status);
  });
});
