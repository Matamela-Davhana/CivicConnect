const contract = require('../helpers/contract');
const db = require('../helpers/db');
const { actor } = require('../helpers/api');

const { routes, http } = contract;

describe('TC-BB-01 FR-002 / FR-003 / AC-FR-002 / AC-FR-003 (EP): request submission input partitions', () => {
  let app;
  let requester;
  let client;

  beforeAll(async () => {
    app = contract.loadApp();
  });

  beforeEach(async () => {
    await db.resetData();
    requester = await db.seedUser('requester');
    client = await actor(app, requester);
  });

  afterAll(async () => {
    await db.closePool();
  });

  const description = 'Emergency exit light on level 3 is flickering';

  test.each([
    ['valid active category and description', { category: 'Facility Fault', description }],
    ['Other with a non-empty explanation', { category: 'Other', description, otherExplanation: 'Does not match any listed category' }]
  ])('accepts partition: %s', async (_label, payload) => {
    const res = await client.post(routes.requests(), payload);
    expect(res.status).toBe(http.created);
    expect(typeof res.body.reference).toBe('string');
    expect(res.body.reference.length).toBeGreaterThan(0);
    expect(res.body.status).toBe('submitted');
    expect(await db.countRequests()).toBe(1);
    const row = await db.query('SELECT requester_id, submitted_at FROM service_requests WHERE reference = $1', [res.body.reference]);
    expect(row.rows[0].requester_id).toBe(requester.id);
    expect(row.rows[0].submitted_at).toBeInstanceOf(Date);
  });

  test.each([
    ['missing category', { description }],
    ['empty category', { category: '', description }],
    ['free-text category outside the controlled list', { category: 'Plumbing', description }],
    ['missing description', { category: 'IT Support' }],
    ['whitespace-only description', { category: 'IT Support', description: '    ' }],
    ['Other without an explanation', { category: 'Other', description }],
    ['Other with a whitespace-only explanation', { category: 'Other', description, otherExplanation: '   ' }]
  ])('rejects partition: %s and stores nothing', async (_label, payload) => {
    const res = await client.post(routes.requests(), payload);
    expect(res.status).toBe(http.badRequest);
    expect(await db.countRequests()).toBe(0);
  });

  it('rejects a category that an administrator has deactivated', async () => {
    await db.deactivateCategory('Lost Property');
    const res = await client.post(routes.requests(), { category: 'Lost Property', description });
    expect(res.status).toBe(http.badRequest);
    expect(await db.countRequests()).toBe(0);
  });

  it('still accepts the remaining active categories after one is deactivated', async () => {
    await db.deactivateCategory('Lost Property');
    const res = await client.post(routes.requests(), { category: 'Maintenance', description });
    expect(res.status).toBe(http.created);
  });
});
