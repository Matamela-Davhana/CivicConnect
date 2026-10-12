const { Pool } = require('pg');
const { randomUUID } = require('crypto');
const contract = require('./contract');

let pool;

const assertSafeDatabase = () => {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is required for integration and system tests');
  }
  const host = new URL(url).hostname;
  const local = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(host);
  if (!local && process.env.ALLOW_DESTRUCTIVE_TEST_DB !== 'true') {
    throw new Error(`Refusing to run destructive tests against non-local database host "${host}"`);
  }
};

const getPool = () => {
  if (!pool) {
    assertSafeDatabase();
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false
    });
  }
  return pool;
};

const query = (text, params) => getPool().query(text, params);

const closePool = async () => {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
};

const resetData = async () => {
  await query('TRUNCATE status_history, request_entries, service_requests, users RESTART IDENTITY CASCADE');
  await query('UPDATE categories SET active = true');
};

const seedUser = async (role, overrides = {}) => {
  const plain = overrides.password || 'Test-Passw0rd!';
  const email = overrides.email || `${role}.${randomUUID().slice(0, 8)}@example.test`;
  const name = overrides.name || `Test ${role}`;
  const hash = await contract.password().hashPassword(plain);
  const { rows } = await query(
    'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role',
    [name, email, hash, role]
  );
  return { ...rows[0], password: plain };
};

const categoryId = async (name) => {
  const { rows } = await query('SELECT id FROM categories WHERE name = $1', [name]);
  return rows[0].id;
};

const deactivateCategory = (name) => query('UPDATE categories SET active = false WHERE name = $1', [name]);

const insertRequest = async ({
  requesterId,
  category = 'IT Support',
  description = 'Printer on level 2 is jammed and offline',
  otherExplanation = null,
  status = 'submitted',
  assigneeId = null,
  targetDate = null
}) => {
  const reference = `CC-${randomUUID().slice(0, 8).toUpperCase()}`;
  const { rows } = await query(
    `INSERT INTO service_requests
       (reference, category_id, description, other_explanation, status, requester_id, assignee_id, target_resolution_date)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, reference, status, row_version`,
    [reference, await categoryId(category), description, otherExplanation, status, requesterId, assigneeId, targetDate]
  );
  return rows[0];
};

const insertEntry = async ({ requestId, authorId, entryType, content }) => {
  await query(
    'INSERT INTO request_entries (request_id, entry_type, author_id, content) VALUES ($1, $2, $3, $4)',
    [requestId, entryType, authorId, content]
  );
};

const getRequestRow = async (id) => {
  const { rows } = await query('SELECT * FROM service_requests WHERE id = $1', [id]);
  return rows[0];
};

const countRequests = async () => {
  const { rows } = await query('SELECT count(*)::int AS n FROM service_requests');
  return rows[0].n;
};

const historyFor = async (requestId) => {
  const { rows } = await query(
    'SELECT old_status, new_status, changed_by, changed_at FROM status_history WHERE request_id = $1 ORDER BY changed_at, id',
    [requestId]
  );
  return rows;
};

const installHistoryFailureTrigger = async () => {
  await query(`
    CREATE OR REPLACE FUNCTION tc_fail_history() RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'forced history failure';
    END;
    $$ LANGUAGE plpgsql
  `);
  await query('DROP TRIGGER IF EXISTS tc_fail_history_trg ON status_history');
  await query(`
    CREATE TRIGGER tc_fail_history_trg
    BEFORE INSERT ON status_history
    FOR EACH ROW EXECUTE FUNCTION tc_fail_history()
  `);
};

const removeHistoryFailureTrigger = async () => {
  await query('DROP TRIGGER IF EXISTS tc_fail_history_trg ON status_history');
  await query('DROP FUNCTION IF EXISTS tc_fail_history()');
};

module.exports = {
  query,
  closePool,
  resetData,
  seedUser,
  categoryId,
  deactivateCategory,
  insertRequest,
  insertEntry,
  getRequestRow,
  countRequests,
  historyFor,
  installHistoryFailureTrigger,
  removeHistoryFailureTrigger
};
