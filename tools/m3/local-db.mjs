// Disposable local infrastructure only; never accepts an external database URL.
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const ROOT = join(REPO, 'artifacts/m3/local-staging');
export const DATABASE = 'civicconnect_m3_staging';
export const PORT = 55432;
const DATA = join(ROOT, 'data');
const ADMIN = 'm3_local_admin';
const APP = 'm3_local_app';
const MIGRATION = join(REPO, 'source/backend/migrations/001_initial_schema.sql');
const CONFIG = join(ROOT, 'private.json');

export function validateConfig(config) {
  if (config?.purpose !== 'civicconnect-disposable-local-v1' || config.port !== PORT ||
      config.database !== DATABASE || config.data !== DATA ||
      !isAbsolute(config.pgBin || '') ||
      !/^[a-f0-9]{64}$/.test(config.adminPassword || '') ||
      !/^[a-f0-9]{64}$/.test(config.appPassword || '') ||
      !/^[a-f0-9]{64}$/.test(config.migrationSha256 || '')) {
    throw new Error('Invalid local-staging identity; refusing to operate.');
  }
  return config;
}

export function childEnvironment(password) {
  // Inherited PG* settings must not redirect psql or change its configuration.
  return {
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^PG/i.test(key))),
    PGCONNECT_TIMEOUT: '5', ...(password ? { PGPASSWORD: password } : {}),
  };
}

export function parseArgs(args) {
  const [action, ...rest] = args;
  if (!['init', 'start', 'verify', 'stop', '--help'].includes(action)) {
    throw new Error('Choose init, start, verify, stop or --help.');
  }
  if (rest.length && (action !== 'init' || rest.length !== 2 || rest[0] !== '--pg-bin' || !isAbsolute(rest[1]))) {
    throw new Error('Only init accepts --pg-bin followed by an absolute directory.');
  }
  return { action, pgBin: rest[1] || 'C:\\Program Files\\PostgreSQL\\18\\bin' };
}

function run(config, name, args, { input, password, allowFailure = false } = {}) {
  const executable = join(config.pgBin, name + (process.platform === 'win32' ? '.exe' : ''));
  const result = spawnSync(executable, args, {
    input, encoding: 'utf8', windowsHide: true,
    // Windows pg_ctl can leave pipe handles inherited by the background server.
    // Its server output goes to -l; do not wait for those inherited pipes to close.
    ...(name === 'pg_ctl' && args[0] === 'start' ? { stdio: 'ignore' } : {}),
    env: childEnvironment(password), timeout: 60000,
  });
  if ((result.error || result.status !== 0) && !allowFailure) {
    // SQL/passwords can occur in native diagnostics. Never echo them to shared output.
    throw new Error(`${name} failed (exit ${result.status ?? 'unavailable'}). Inspect local private logs; no credentials printed.`);
  }
  return result;
}

function sql(config, query, { admin = true, database = DATABASE, allowFailure = false } = {}) {
  return run(config, 'psql', ['-X', '-w', '-h', '127.0.0.1', '-p', String(PORT),
    '-U', admin ? ADMIN : APP, '-d', database, '-A', '-t', '-v', 'ON_ERROR_STOP=1'],
  { input: query, password: admin ? config.adminPassword : config.appPassword, allowFailure });
}

function ensureContained(path) {
  const rel = relative(realpathSync(REPO), realpathSync(path));
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error('Staging path escapes the repository; refusing to operate.');
  }
}

function readConfig() {
  ensureContained(ROOT);
  ensureContained(DATA);
  let config;
  try { config = JSON.parse(readFileSync(CONFIG, 'utf8')); }
  catch { throw new Error('Cannot read private staging configuration. No credentials printed.'); }
  return validateConfig(config);
}

function start(config) {
  const status = run(config, 'pg_ctl', ['status', '-D', DATA], { allowFailure: true });
  if (status.status === 0) throw new Error('Owned cluster is already running. Use verify, or stop it first.');
  if (status.status !== 3) throw new Error('Cannot establish stopped-cluster status; refusing to start.');
  run(config, 'pg_ctl', ['start', '-D', DATA, '-l', join(ROOT, 'postgres.log'), '-w', '-t', '30',
    '-o', `-h 127.0.0.1 -p ${PORT}`]);
}

function stop(config) {
  const status = run(config, 'pg_ctl', ['status', '-D', DATA], { allowFailure: true });
  if (status.status === 3) return;
  if (status.status !== 0) throw new Error('Cannot establish owned-cluster status; refusing to stop.');
  run(config, 'pg_ctl', ['stop', '-D', DATA, '-m', 'fast', '-w', '-t', '30']);
}

function assertIdentity(config) {
  const r = sql(config, "SELECT json_build_object('data', current_setting('data_directory'), 'port', current_setting('port'), 'listen', current_setting('listen_addresses'), 'database', current_database(), 'version', version())");
  const identity = JSON.parse(r.stdout.trim());
  if (realpathSync(identity.data) !== realpathSync(DATA) || identity.port !== String(PORT) ||
      identity.listen !== '127.0.0.1' || identity.database !== DATABASE) {
    throw new Error('Database identity does not match this disposable cluster.');
  }
  return identity;
}

function verify(config) {
  const identity = assertIdentity(config);
  const checks = [];
  const check = (name, condition) => {
    checks.push({ name, pass: Boolean(condition) });
    if (!condition) throw new Error(`Database verification failed: ${name}`);
  };
  check('Owned cluster, dedicated database and loopback-only port', true);
  check('Migration file unchanged since initialisation', createHash('sha256').update(readFileSync(MIGRATION)).digest('hex') === config.migrationSha256);
  check('Five application tables present', sql(config, "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('users','categories','service_requests','status_history','request_entries')").stdout.trim() === '5');
  check('Runtime can read seven baseline categories', sql(config, 'SELECT count(*) FROM categories', { admin: false }).stdout.trim() === '7');
  check('Runtime role can read, is not a superuser and cannot create roles or databases',
    sql(config, "SELECT current_user = 'm3_local_app' AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication FROM pg_roles WHERE rolname=current_user", { admin: false }).stdout.trim() === 't');
  check('Runtime can insert but cannot update, delete or truncate audit tables',
    sql(config, `SELECT bool_and(has_table_privilege(current_user, t, 'INSERT') AND NOT has_table_privilege(current_user, t, 'UPDATE') AND NOT has_table_privilege(current_user, t, 'DELETE') AND NOT has_table_privilege(current_user, t, 'TRUNCATE')) FROM unnest(ARRAY['status_history','request_entries']) t`, { admin: false }).stdout.trim() === 't');
  const denied = sql(config, 'BEGIN; UPDATE status_history SET new_status=new_status WHERE false; ROLLBACK;', { admin: false, allowFailure: true });
  check('Actual audit UPDATE rejected', denied.status !== 0 && /permission denied for table status_history/.test(denied.stderr));
  const rejected = run({ ...config }, 'psql', ['-X', '-w', '-h', '127.0.0.1', '-p', String(PORT), '-U', APP, '-d', DATABASE, '-c', 'SELECT 1'],
    { password: randomBytes(32).toString('hex'), allowFailure: true });
  check('Incorrect runtime database password rejected', rejected.status !== 0 && /password authentication failed/.test(rejected.stderr));
  const report = {
    recordedAt: new Date().toISOString(), classification: 'DATABASE_INFRASTRUCTURE_ONLY',
    node: process.version, platform: process.platform, postgres: identity.version,
    database: DATABASE, address: `127.0.0.1:${PORT}`, migrationSha256: config.migrationSha256,
    checks, serviceRequestCount: Number(sql(config, 'SELECT count(*) FROM service_requests').stdout.trim()),
    limitations: ['Not application acceptance or deployment evidence.', 'No synthetic application accounts or performance dataset seeded.', 'Local PostgreSQL may differ from CI/Supabase; record the version gap.', 'PostgreSQL trust boundaries do not replace application role/visibility checks.'],
  };
  const reportPath = join(ROOT, `verification-${Date.now()}.json`);
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(`${checks.length}/${checks.length} database infrastructure checks passed. Report: ${relative(REPO, reportPath)}`);
}

function initialise(pgBin) {
  if (existsSync(ROOT)) throw new Error('Local staging directory already exists. It will not be overwritten or reset.');
  const migration = readFileSync(MIGRATION);
  const config = validateConfig({
    purpose: 'civicconnect-disposable-local-v1', port: PORT, database: DATABASE, data: DATA,
    pgBin, adminPassword: randomBytes(32).toString('hex'), appPassword: randomBytes(32).toString('hex'),
    migrationSha256: createHash('sha256').update(migration).digest('hex'),
  });
  run(config, 'initdb', ['--version']);
  // Ensure ignored parents cannot be symlinks to a different workspace.
  mkdirSync(join(REPO, 'artifacts'), { recursive: true });
  ensureContained(join(REPO, 'artifacts'));
  mkdirSync(join(REPO, 'artifacts/m3'), { recursive: true });
  ensureContained(join(REPO, 'artifacts/m3'));
  mkdirSync(ROOT);
  writeFileSync(CONFIG, JSON.stringify(config, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  const passwordFile = join(ROOT, 'init-password.txt');
  writeFileSync(passwordFile, config.adminPassword + '\n', { flag: 'wx', mode: 0o600 });
  try {
    run(config, 'initdb', ['-D', DATA, '-U', ADMIN, '--pwfile', passwordFile,
      '--auth=scram-sha-256', '--encoding=UTF8', '--locale=C', '--no-clean',
      '--set', 'listen_addresses=127.0.0.1', '--set', `port=${PORT}`]);
  } finally { unlinkSync(passwordFile); }
  try {
    start(config);
    sql(config, `CREATE ROLE ${APP} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '${config.appPassword}';\nCREATE DATABASE ${DATABASE};`, { database: 'postgres' });
    assertIdentity(config);
    sql(config, `BEGIN;\n${migration.toString('utf8')}\nREVOKE ALL ON DATABASE ${DATABASE} FROM PUBLIC;\nGRANT CONNECT ON DATABASE ${DATABASE} TO ${APP};\nREVOKE CREATE ON SCHEMA public FROM PUBLIC;\nGRANT USAGE ON SCHEMA public TO ${APP};\nGRANT SELECT, INSERT, UPDATE ON users, categories, service_requests TO ${APP};\nGRANT SELECT, INSERT ON status_history, request_entries TO ${APP};\nCOMMIT;`);
    const appEnv = `# Private, disposable local database only. Never commit or screenshot.\nNODE_ENV=test\nPORT=3300\nBASE_URL=http://127.0.0.1:3300\nDATABASE_URL=postgresql://${APP}:${config.appPassword}@127.0.0.1:${PORT}/${DATABASE}\nJWT_SECRET=${randomBytes(48).toString('hex')}\n`;
    writeFileSync(join(ROOT, '.env.staging'), appEnv, { flag: 'wx', mode: 0o600 });
    verify(config);
    stop(config);
    start(config);
    verify(config);
    console.log('Database restart verified; baseline categories retained. No application has been deployed.');
  } finally {
    stop(config);
  }
  console.log('Database stopped. Private configuration is in the ignored artifacts/m3/local-staging folder.');
}

export function main(args) {
  const { action, pgBin } = parseArgs(args);
  if (action === '--help') {
    console.log('node tools/m3/local-db.mjs init [--pg-bin ABSOLUTE_DIRECTORY]\nnode tools/m3/local-db.mjs start|verify|stop\nFixed target: disposable artifacts/m3/local-staging, 127.0.0.1:55432 only.\ninit migrates a NEW cluster, verifies a restart, then stops it. No reset/delete command.');
  } else if (action === 'init') initialise(pgBin);
  else {
    const config = readConfig();
    if (action === 'start') { start(config); assertIdentity(config); console.log('Owned local database started; application is not started.'); }
    if (action === 'verify') verify(config);
    if (action === 'stop') { stop(config); console.log('Owned local database stopped. Data retained.'); }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
