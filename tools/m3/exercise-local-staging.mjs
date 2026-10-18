// Runs only inside the fresh, owned cluster prepared by stage-local.ps1.
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { hostname, cpus, totalmem, release } from 'node:os';
import { validateConfig, smoke, runPerformance } from './checks.mjs';
import safety from '../devops/e2e-safety.cjs';

safety.assertDisposable(process.env, true);
const candidate = resolve(process.env.STAGING_CANDIDATE_DIRECTORY);
const output = resolve(process.env.STAGING_EVIDENCE_DIRECTORY);
const runId = process.env.STAGING_RUN_ID;
const commit = process.env.STAGING_CANDIDATE_SHA;
if (!/^[a-f0-9]{32}$/.test(runId || '') || !/^[a-f0-9]{40}$/.test(commit || '')) throw new Error('Missing staging identity.');
const require = createRequire(join(candidate, 'source/backend/package.json'));
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const save = (name, data) => writeFile(join(output, name), JSON.stringify(data, null, 2) + '\n', { flag: 'wx' });
const targetCount = 10000;

try {
  const identity = (await pool.query('SELECT run_id, candidate_sha FROM staging_run_identity')).rows;
  if (identity.length !== 1 || identity[0].run_id !== runId || identity[0].candidate_sha !== commit) throw new Error('Not this runner-owned database.');
  const before = Number((await pool.query('SELECT count(*) FROM service_requests')).rows[0].count);
  if (before < 3 || before > 100) throw new Error('Expected only the fresh seed/browser fixtures. Refusing to overwrite or reset data.');
  // No deletes or updates. These are synthetic state snapshots, not lifecycle evidence.
  const client = await pool.connect();
  await client.query('BEGIN');
  try {
    await client.query(`WITH cats AS (
      SELECT id, name, row_number() OVER (ORDER BY name)::int AS n FROM categories WHERE active=true
    ), seed AS (
      SELECT g, c.id AS category_id, c.name AS category_name,
        (ARRAY['submitted','accepted','assigned','in_progress','on_hold','resolved','closed','rejected'])[1+g%8] AS status
      FROM generate_series(1, $1::int) g JOIN cats c ON c.n=1+g%(SELECT count(*)::int FROM cats)
    ) INSERT INTO service_requests(reference,category_id,description,other_explanation,status,requester_id,assignee_id,target_resolution_date,submitted_at)
      SELECT 'PERF-'||lpad(g::text,8,'0'), category_id,
        'Synthetic performance fixture '||g||': municipal service inspection required.',
        CASE WHEN category_name='Other' THEN 'Synthetic other category' END, status,
        (SELECT id FROM users WHERE email='requester@example.com'),
        CASE WHEN status IN ('assigned','in_progress','on_hold','resolved','closed') THEN (SELECT id FROM users WHERE email='staff@example.com') END,
        CASE WHEN status NOT IN ('submitted','rejected') THEN CURRENT_DATE+(g%31-15) END,
        now()-(g%90)*interval '1 day' FROM seed`, [targetCount - before]);
    await client.query(`INSERT INTO status_history(request_id,old_status,new_status,changed_by,changed_at)
      SELECT id,NULL,status,requester_id,submitted_at FROM service_requests WHERE reference LIKE 'PERF-%'`);
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
  await pool.query('ANALYZE service_requests');
  const count = Number((await pool.query('SELECT count(*) FROM service_requests')).rows[0].count);
  if (count !== targetCount) throw new Error('Independent SQL count is not 10000.');
  const provenance = {
    candidateSha: commit, runId, recordedAt: new Date().toISOString(),
    environment: 'isolated-local-simulated-staging', node: process.version,
    os: `${process.platform} ${release()}`, cpu: cpus()[0]?.model, logicalCpuCount: cpus().length,
    totalMemoryBytes: totalmem(), machine: hostname(),
    databaseVersion: (await pool.query('SHOW server_version')).rows[0].server_version,
    databaseSettings: (await pool.query("SELECT name,setting,unit FROM pg_settings WHERE name IN ('max_connections','shared_buffers') ORDER BY name")).rows,
    database: (await pool.query('SELECT current_database() AS name')).rows[0].name,
    dataset: { before, after: count, added: targetCount - before,
      statuses: (await pool.query('SELECT status,count(*)::int AS count FROM service_requests GROUP BY status ORDER BY status')).rows,
      categories: (await pool.query('SELECT c.name,count(*)::int AS count FROM service_requests r JOIN categories c ON c.id=r.category_id GROUP BY c.name ORDER BY c.name')).rows },
    limitations: ['Local load generator and API/database share one machine.', 'One shared staff identity, closed-loop requests and no browser rendering in load measurement.',
      'Unpaginated full staff queue; all 10000 rows are returned.', 'Runtime database user is a disposable superuser, not production least-privilege validation.',
      'Public seeded account passwords are local synthetic fixtures only; cluster password/JWT are random per run.',
      'Not a Render/Supabase deployment or production-capacity claim.'],
  };
  await save('dataset-environment.json', provenance);
  const auth = await fetch(process.env.BASE_URL + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'staff@example.com', password: 'password123' }),
    redirect: 'error', signal: AbortSignal.timeout(10000),
  });
  const body = await auth.json();
  if (!auth.ok || !body.token || body.user?.role !== 'staff') throw new Error('Staff authentication failed.');
  const config = validateConfig({ baseUrl: process.env.BASE_URL, commit, environment: provenance.environment,
    token: body.token, datasetCount: count, users: 50, durationMs: 300000, warmupMs: 60000,
    thinkMs: 2000, timeoutMs: 10000, targetMs: 2000 });
  // Check full API result count independently, outside measured samples.
  const queueResponse = await fetch(config.baseUrl + '/api/staff/requests', {
    headers: { Authorization: `Bearer ${config.token}` }, redirect: 'error', signal: AbortSignal.timeout(10000),
  });
  const queue = await queueResponse.json();
  if (!queueResponse.ok || !Array.isArray(queue) || queue.length !== count || new Set(queue.map(r => r.id)).size !== count) throw new Error('API/SQL count mismatch.');
  await save('smoke.json', { candidateSha: commit, sqlCount: count, apiCount: queue.length, ...(await smoke(config)) });
  for (const [name, changes] of [['diagnostic', { users: 2, warmupMs: 2000, durationMs: 10000 }], ['performance', {}]]) {
    const settings = { ...config, ...changes };
    const { token, ...publicSettings } = settings;
    const path = join(output, name + '.json');
    const startedAt = new Date().toISOString();
    await writeFile(path, JSON.stringify({ status: 'INCOMPLETE', startedAt, config: publicSettings }), { flag: 'wx' });
    console.log(`Starting ${name}: ${settings.users} users, ${settings.warmupMs/1000}s warm-up, ${settings.durationMs/1000}s measurement, ${count} requests in database.`);
    const result = await runPerformance(settings);
    await writeFile(path, JSON.stringify({ startedAt, finishedAt: new Date().toISOString(), config: publicSettings, ...result }, null, 2) + '\n');
    console.log(`${name}: ${result.status}; p95=${result.summary?.p95Ms?.toFixed(2) ?? 'n/a'}ms; errors=${result.summary?.failures ?? 'n/a'}`);
    if (result.status !== 'PASS') { process.exitCode = 1; break; }
  }
} finally { await pool.end(); }
