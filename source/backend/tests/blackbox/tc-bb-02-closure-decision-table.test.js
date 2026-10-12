const contract = require('../helpers/contract');
const db = require('../helpers/db');
const { actor } = require('../helpers/api');

const { routes, http } = contract;

const rows = [
  ['R1 resolve with resolution information', 'in_progress', { status: 'resolved', resolution: 'Replaced faulty power supply' }, http.ok, 'resolved'],
  ['R2 resolve without resolution information', 'in_progress', { status: 'resolved' }, http.badRequest, 'in_progress'],
  ['R3 resolve with blank resolution information', 'in_progress', { status: 'resolved', resolution: '   ' }, http.badRequest, 'in_progress'],
  ['R4 reject with a requester-visible reason', 'submitted', { status: 'rejected', reason: 'Duplicate of an existing request' }, http.ok, 'rejected'],
  ['R5 reject without a reason', 'submitted', { status: 'rejected' }, http.badRequest, 'submitted'],
  ['R6 close a resolved request', 'resolved', { status: 'closed' }, http.ok, 'closed'],
  ['R7 close a request that is not resolved', 'in_progress', { status: 'closed' }, http.invalidTransition, 'in_progress'],
  ['R8 reopen a resolved request with a reason', 'resolved', { status: 'in_progress', reason: 'Fault returned the next day' }, http.ok, 'in_progress'],
  ['R9 reopen a resolved request without a reason', 'resolved', { status: 'in_progress' }, http.badRequest, 'resolved'],
  ['R10 place in progress work on hold with a reason', 'in_progress', { status: 'on_hold', reason: 'Waiting for supplier part' }, http.ok, 'on_hold'],
  ['R11 place in progress work on hold without a reason', 'in_progress', { status: 'on_hold' }, http.badRequest, 'in_progress']
];

describe('TC-BB-02 FR-014 / RD-05 / AC-FR-014 (decision table): conditions that gate resolve, reject, close, reopen and hold', () => {
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

  test.each(rows)('%s', async (_label, startStatus, payload, expectedHttp, expectedStatus) => {
    const hasOwner = startStatus !== 'submitted';
    const request = await db.insertRequest({
      requesterId: requester.id,
      status: startStatus,
      assigneeId: hasOwner ? staff.id : null,
      targetDate: hasOwner ? contract.isoDate(14) : null
    });

    const res = await client.post(routes.status(request.id), { ...payload, rowVersion: request.row_version });

    expect(res.status).toBe(expectedHttp);
    const row = await db.getRequestRow(request.id);
    expect(row.status).toBe(expectedStatus);
    const history = await db.historyFor(request.id);
    if (expectedHttp === http.ok) {
      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({ old_status: startStatus, new_status: expectedStatus, changed_by: staff.id });
      expect(row.row_version).toBe(request.row_version + 1);
    } else {
      expect(history).toHaveLength(0);
      expect(row.row_version).toBe(request.row_version);
    }
  });
});
