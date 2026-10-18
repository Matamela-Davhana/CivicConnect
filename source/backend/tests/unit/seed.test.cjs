const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const bcrypt = require('bcrypt');

const sql = readFileSync(path.join(__dirname, '../../migrations/seed.sql'), 'utf8');
test('all four sample accounts contain usable bcrypt hashes, not plaintext', async () => {
  const hashes = [...sql.matchAll(/'(\$2b\$12\$[^']+)'/g)].map((match) => match[1]);
  assert.equal(hashes.length, 4);
  for (const hash of hashes) {
    assert.equal(await bcrypt.compare('password123', hash), true);
    assert.equal(await bcrypt.compare('wrong-password', hash), false);
  }
});
test('sample seed is transactional and restricted to explicitly named test databases', () => {
  assert.match(sql, /BEGIN;/);
  assert.match(sql, /current_database\(\) NOT IN \('civicconnect_local_review', 'civicconnect_test'\)/);
  assert.match(sql, /RAISE EXCEPTION/);
  assert.match(sql, /IF EXISTS \(SELECT 1 FROM users\)/);
  assert.match(sql, /COMMIT;\s*$/);
});
test('sample request relationships select exact test accounts, not arbitrary roles', () => {
  assert.doesNotMatch(sql, /WHERE role=/);
  assert.match(sql, /WHERE email='requester@example.com'/);
  assert.match(sql, /WHERE email='staff@example.com'/);
});
