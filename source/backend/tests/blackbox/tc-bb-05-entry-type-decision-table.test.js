const contract = require('../helpers/contract');
const db = require('../helpers/db');
const { actor } = require('../helpers/api');

const { routes, http } = contract;

const PUBLIC_TEXT = 'Technician will visit on Thursday morning';
const INTERNAL_TEXT = 'Requester is a repeat reporter; verify before dispatch';

describe('TC-BB-05 FR-012 / FR-013 / RD-08 / AC-FR-012 (decision table): entry type and viewer role', () => {
  let app;
  let requester;
  let staff;
  let request;
  let staffClient;
  let requesterClient;

  beforeAll(() => {
    app = contract.loadApp();
  });

  beforeEach(async () => {
    await db.resetData();
    requester = await db.seedUser('requester');
    staff = await db.seedUser('staff');
    request = await db.insertRequest({
      requesterId: requester.id,
      status: 'assigned',
      assigneeId: staff.id,
      targetDate: contract.isoDate(7)
    });
    staffClient = await actor(app, staff);
    requesterClient = await actor(app, requester);
  });

  afterAll(async () => {
    await db.closePool();
  });

  test.each([
    ['entry classified as public', 'public', PUBLIC_TEXT, http.created],
    ['entry classified as internal', 'internal', INTERNAL_TEXT, http.created],
    ['entry type omitted', undefined, 'No classification chosen', http.badRequest],
    ['entry type outside the allowed set', 'secret', 'Invalid classification', http.badRequest],
    ['entry with blank content', 'public', '   ', http.badRequest]
  ])('staff saves %s -> %s', async (_label, entryType, content, expected) => {
    const res = await staffClient.post(routes.entries(request.id), { entryType, content });
    expect(res.status).toBe(expected);
    const stored = await db.query('SELECT count(*)::int AS n FROM request_entries WHERE request_id = $1', [request.id]);
    expect(stored.rows[0].n).toBe(expected === http.created ? 1 : 0);
  });

  it('shows a requester only the public update while staff see both, in chronological order', async () => {
    expect((await staffClient.post(routes.entries(request.id), { entryType: 'public', content: PUBLIC_TEXT })).status).toBe(http.created);
    expect((await staffClient.post(routes.entries(request.id), { entryType: 'internal', content: INTERNAL_TEXT })).status).toBe(http.created);

    const requesterView = await requesterClient.get(routes.timeline(request.id));
    expect(requesterView.status).toBe(http.ok);
    expect(requesterView.body.entries.map((e) => e.content)).toEqual([PUBLIC_TEXT]);
    expect(JSON.stringify(requesterView.body)).not.toContain(INTERNAL_TEXT);

    const staffView = await staffClient.get(routes.timeline(request.id));
    expect(staffView.status).toBe(http.ok);
    expect(staffView.body.entries.map((e) => e.content)).toEqual([PUBLIC_TEXT, INTERNAL_TEXT]);
    expect(staffView.body.entries.map((e) => e.entryType)).toEqual(['public', 'internal']);
    expect(staffView.body.entries.every((e) => e.createdAt && e.authorId === staff.id)).toBe(true);
  });
});
