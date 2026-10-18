const bcrypt = require('bcrypt');
const { Buffer } = require('node:buffer');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLES = ['requester', 'staff', 'management', 'admin'];
const USER_FIELDS = 'id, name, email, role, active';
class AdminError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const invalid = (message) => { throw new AdminError(422, message); };
function object(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) invalid('Send a valid form.');
}
function text(value, max, field) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) invalid(`${field} must contain 1–${max} characters.`);
  return value.trim();
}
function validateUser(body) {
  object(body);
  const name = text(body.name, 150, 'Name');
  const email = text(body.email, 255, 'Email').toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) invalid('Enter a valid email address.');
  if (!ROLES.includes(body.role)) invalid('Choose a valid role.');
  if (typeof body.password !== 'string' || body.password.length < 12 || !body.password.trim() || Buffer.byteLength(body.password, 'utf8') > 72) {
    invalid('Use an initial password of at least 12 characters and at most 72 UTF-8 bytes.');
  }
  return { name, email, role: body.role, password: body.password };
}
function validatePatch(body, user = false) {
  object(body);
  const keys = Object.keys(body);
  const allowed = user ? ['role', 'active'] : ['active'];
  if (!keys.length || keys.some((key) => !allowed.includes(key))) invalid('Choose only supported account/category changes.');
  if ('active' in body && typeof body.active !== 'boolean') invalid('Active must be true or false.');
  if ('role' in body && !ROLES.includes(body.role)) invalid('Choose a valid role.');
  return body;
}
async function withAdmin(db, actor, work) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    // Serialize admin writes; recheck the actor after waiting for the lock.
    await client.query('SELECT pg_advisory_xact_lock(381, 18)');
    const current = (await client.query('SELECT role, active, token_version FROM users WHERE id=$1 FOR SHARE', [actor.id])).rows[0];
    if (!current || !current.active || current.role !== 'admin' || current.token_version !== actor.tokenVersion) throw new AdminError(401, 'Your session has expired. Sign in again.');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
async function createUser(db, body, actor) {
  const input = validateUser(body);
  const hash = await bcrypt.hash(input.password, 12);
  return withAdmin(db, actor, async (client) => (await client.query(
    `INSERT INTO users (name,email,password_hash,role) VALUES ($1,$2,$3,$4) RETURNING ${USER_FIELDS}`,
    [input.name, input.email, hash, input.role])).rows[0]);
}
async function updateUser(db, id, body, actor) {
  if (!UUID.test(id)) throw new AdminError(404, 'User not found.');
  const patch = validatePatch(body, true);
  if (id.toLowerCase() === actor.id.toLowerCase()) throw new AdminError(403, 'You cannot change your own role or active status.');
  return withAdmin(db, actor, async (client) => {
    const target = (await client.query(`SELECT ${USER_FIELDS} FROM users WHERE id=$1 FOR UPDATE`, [id])).rows[0];
    if (!target) throw new AdminError(404, 'User not found.');
    const role = patch.role ?? target.role;
    const active = patch.active ?? target.active;
    if (target.role === 'admin' && target.active && (role !== 'admin' || !active)) {
      const count = (await client.query("SELECT COUNT(*)::int AS count FROM users WHERE role='admin' AND active=true")).rows[0].count;
      if (count <= 1) throw new AdminError(409, 'At least one active administrator must remain.');
    }
    if (role === target.role && active === target.active) return target;
    return (await client.query(`UPDATE users SET role=$1, active=$2, token_version=token_version+1 WHERE id=$3 RETURNING ${USER_FIELDS}`, [role, active, id])).rows[0];
  });
}
async function createCategory(db, body, actor) {
  object(body);
  const name = text(body.name, 50, 'Category name');
  return withAdmin(db, actor, async (client) => (await client.query('INSERT INTO categories (name) VALUES ($1) RETURNING id, name, active', [name])).rows[0]);
}
async function updateCategory(db, id, body, actor) {
  if (!UUID.test(id)) throw new AdminError(404, 'Category not found.');
  const patch = validatePatch(body);
  return withAdmin(db, actor, async (client) => {
    const result = await client.query('UPDATE categories SET active=$1 WHERE id=$2 RETURNING id, name, active', [patch.active, id]);
    if (!result.rows.length) throw new AdminError(404, 'Category not found.');
    return result.rows[0];
  });
}
module.exports = { AdminError, USER_FIELDS, validateUser, validatePatch, withAdmin, createUser, updateUser, createCategory, updateCategory };
