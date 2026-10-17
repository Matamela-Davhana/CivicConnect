import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { DATABASE, PORT, ROOT, parseArgs, childEnvironment, validateConfig } from './local-db.mjs';

const valid = () => ({ purpose: 'civicconnect-disposable-local-v1', port: PORT,
  database: DATABASE, data: join(ROOT, 'data'), pgBin: ROOT,
  adminPassword: 'a'.repeat(64), appPassword: 'b'.repeat(64), migrationSha256: 'c'.repeat(64) });

test('Only explicit local database lifecycle commands are accepted', () => {
  for (const action of ['init', 'start', 'verify', 'stop', '--help']) assert.equal(parseArgs([action]).action, action);
  for (const args of [[], ['reset'], ['init', '--database-url', 'postgres://remote'], ['stop', '--pg-bin', ROOT], ['init', '--pg-bin', 'relative']]) assert.throws(() => parseArgs(args));
});
test('Initialisation accepts an absolute PostgreSQL binaries directory', () => {
  assert.equal(parseArgs(['init', '--pg-bin', ROOT]).pgBin, ROOT);
});
test('Identity rejects other ports, databases, data directories and unmarked folders', () => {
  assert.equal(validateConfig(valid()).port, PORT);
  for (const changed of [{ port: 5432 }, { database: 'production' }, { data: ROOT }, { purpose: 'other' }, { pgBin: 'relative' }]) {
    assert.throws(() => validateConfig({ ...valid(), ...changed }));
  }
});
test('Invalid or SQL-bearing credentials and migration hashes are rejected', () => {
  for (const key of ['adminPassword', 'appPassword', 'migrationSha256']) {
    assert.throws(() => validateConfig({ ...valid(), [key]: "'; DROP DATABASE example; --" }));
  }
});
test('Inherited PG settings cannot redirect the database client', () => {
  const prior = process.env.PGHOST;
  try {
    process.env.PGHOST = 'must-not-connect.example';
    const env = childEnvironment('test-only');
    assert.equal(env.PGHOST, undefined);
    assert.equal(env.PGPASSWORD, 'test-only');
    assert.equal(env.PGCONNECT_TIMEOUT, '5');
    assert.equal(childEnvironment().PGPASSWORD, undefined);
  } finally {
    if (prior === undefined) delete process.env.PGHOST; else process.env.PGHOST = prior;
  }
});
