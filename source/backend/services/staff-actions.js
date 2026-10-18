const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = ['submitted', 'accepted', 'assigned', 'in_progress', 'on_hold', 'resolved', 'closed', 'rejected'];
const TRANSITIONS = Object.freeze({
  accepted: [], assigned: ['in_progress'], in_progress: ['on_hold', 'resolved'],
  on_hold: ['in_progress'], resolved: ['closed'],
});
class StaffActionError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const invalid = (message) => { throw new StaffActionError(422, message); };
const conflict = () => { throw new StaffActionError(409, 'This request has changed. Refresh it, review the latest details and try again.'); };

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validateAction(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) invalid('Enter a valid staff action.');
  if (!Number.isSafeInteger(body.rowVersion) || body.rowVersion < 1 || body.rowVersion >= 2147483647) {
    invalid('A valid request version is required. Refresh the request first.');
  }
  const result = { action: body.action, rowVersion: body.rowVersion };
  if (!['accept', 'reject', 'assign', 'set_target', 'update'].includes(body.action)) invalid('Choose a supported staff action.');
  if (['accept', 'set_target'].includes(body.action)) {
    if (!validDate(body.targetDate)) invalid('Choose a valid target date (YYYY-MM-DD).');
    result.targetDate = body.targetDate;
  }
  if (body.action === 'assign') {
    if (typeof body.assigneeId !== 'string' || !UUID.test(body.assigneeId)) invalid('Choose a valid staff member.');
    result.assigneeId = body.assigneeId;
  }
  if (['reject', 'update'].includes(body.action)) {
    const value = body.action === 'reject' ? body.reason : body.message;
    if (typeof value !== 'string' || !value.trim() || value.trim().length > 1000) {
      invalid('Enter a reason or update between 1 and 1000 characters.');
    }
    result.message = value.trim();
    result.visibility = body.action === 'reject' ? 'public' : body.visibility;
    if (!['public', 'internal'].includes(result.visibility)) invalid('Choose public or internal visibility.');
    if (body.action === 'update' && body.status !== undefined) {
      if (typeof body.status !== 'string' || !STATUSES.includes(body.status)) invalid('Choose a valid request status.');
      result.status = body.status;
    }
  }
  return result;
}

async function applyStaffAction(db, id, body, actorId) {
  if (!UUID.test(id)) throw new StaffActionError(404, 'Request not found.');
  const input = validateAction(body);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const row = (await client.query(`SELECT id, status, row_version, assignee_id,
      target_resolution_date::text AS target_date FROM service_requests WHERE id=$1`, [id])).rows[0];
    if (!row) throw new StaffActionError(404, 'Request not found.');
    if (row.row_version !== input.rowVersion) conflict();
    if (['closed', 'rejected'].includes(row.status)) invalid('This request is closed. No further changes are allowed.');
    let status = row.status;
    let assignee = row.assignee_id;
    let target = row.target_date;
    let message = input.message;
    let visibility = input.visibility;
    switch (input.action) {
      case 'accept':
        if (row.status !== 'submitted') invalid('Only submitted requests can be accepted.');
        status = 'accepted'; target = input.targetDate;
        message = `Target date set to ${target}.`; visibility = 'public';
        break;
      case 'reject':
        if (row.status !== 'submitted') invalid('Only submitted requests can be rejected.');
        status = 'rejected';
        break;
      case 'assign': {
        if (!['accepted', 'assigned', 'in_progress', 'on_hold'].includes(row.status)) invalid('Accept the request before assigning it.');
        const person = (await client.query("SELECT id, name FROM users WHERE id=$1 AND role='staff' AND active=true FOR SHARE", [input.assigneeId])).rows[0];
        if (!person) invalid('The selected staff member is not available.');
        assignee = person.id;
        if (row.status === 'accepted') status = 'assigned';
        message = `Assigned to ${person.name}.`; visibility = 'internal';
        break;
      }
      case 'set_target':
        if (!['accepted', 'assigned', 'in_progress', 'on_hold'].includes(row.status)) invalid('Target dates can only change on active accepted requests.');
        target = input.targetDate;
        message = `Target date changed to ${target}.`; visibility = 'public';
        break;
      case 'update':
        if (!TRANSITIONS[row.status]) invalid('Accept or reject this request before posting progress.');
        if (input.status && input.status !== row.status) {
          if (!TRANSITIONS[row.status].includes(input.status)) invalid('That status change is not allowed from the current status.');
          status = input.status;
        }
        break;
    }
    if (!['submitted', 'rejected'].includes(status) && !target) invalid('Set a target date before continuing.');
    if (['assigned', 'in_progress', 'on_hold', 'resolved', 'closed'].includes(status) && !assignee) invalid('Assign a staff member before progressing this request.');
    // Compare-and-swap is the concurrency gate. Every action, including a comment,
    // advances the version, and all audit writes share this transaction.
    const saved = await client.query(`UPDATE service_requests
      SET status=$1, assignee_id=$2, target_resolution_date=$3, row_version=row_version+1
      WHERE id=$4 AND row_version=$5 RETURNING id, status, row_version AS "rowVersion"`,
    [status, assignee, target, id, input.rowVersion]);
    if (!saved.rows.length) conflict();
    if (status !== row.status) await client.query(`INSERT INTO status_history
      (request_id,old_status,new_status,changed_by) VALUES ($1,$2,$3,$4)`, [id, row.status, status, actorId]);
    await client.query(`INSERT INTO request_entries (request_id,entry_type,author_id,content)
      VALUES ($1,$2,$3,$4)`, [id, visibility, actorId, message]);
    await client.query('COMMIT');
    return saved.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}

module.exports = { UUID, STATUSES, TRANSITIONS, StaffActionError, validDate, validateAction, applyStaffAction };
