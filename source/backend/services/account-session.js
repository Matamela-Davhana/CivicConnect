const db = require('../db');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function loadSession(claims) {
  if (typeof claims.id !== 'string' || !UUID.test(claims.id) || !Number.isSafeInteger(claims.tokenVersion) || claims.tokenVersion < 0) return null;
  const row = (await db.query('SELECT id, role, active, token_version FROM users WHERE id=$1', [claims.id])).rows[0];
  if (!row || !row.active || row.role !== claims.role || row.token_version !== claims.tokenVersion) return null;
  return { id: row.id, role: row.role, tokenVersion: row.token_version };
}
module.exports = { loadSession };
