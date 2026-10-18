import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateConfig, summarise, smoke, runPerformance } from './checks.mjs';

const config = {
  baseUrl: 'http://127.0.0.1:3000', commit: 'a'.repeat(40), environment: 'tool-self-test',
  token: 'fixture-token', datasetCount: 10, users: 2, durationMs: 80, warmupMs: 20,
  thinkMs: 5, timeoutMs: 500, targetMs: 2000
};

test('staging Node version check works in Windows PowerShell 5.1 without JS quoting', { skip: process.platform !== 'win32' }, async () => {
  const source = await readFile(new URL('./stage-local.ps1', import.meta.url), 'utf8');
  const check = source.split('# BEGIN NODE VERSION CHECK')[1].split('# END NODE VERSION CHECK')[0];
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    '$ErrorActionPreference = \'Stop\'; $stageNode = $env:STAGE_TEST_NODE;' + check], {
    env: { ...process.env, STAGE_TEST_NODE: process.execPath }, encoding: 'utf8', timeout: 15000,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
});

test('staging preserves success and failure exit codes with redirected PowerShell 5.1 processes', { skip: process.platform !== 'win32' }, async t => {
  const source = await readFile(new URL('./stage-local.ps1', import.meta.url), 'utf8');
  const guard = source.split('# BEGIN PROCESS HANDLE GUARD')[1].split('# END PROCESS HANDLE GUARD')[0];
  assert.match(source, /Protect-StageProcessHandle \$initProcess/);
  assert.match(source, /Protect-StageProcessHandle \$pgProcess/);
  const directory = await mkdtemp(join(tmpdir(), 'civicconnect-exit-test-'));
  t.after(() => rm(directory, { recursive: true }));
  const script = `$ErrorActionPreference='Stop'; ${guard}
    foreach ($expected in @(0,7)) {
      $p=Start-Process -FilePath $env:STAGE_TEST_NODE -ArgumentList ('-e process.exit('+$expected+')') -WindowStyle Hidden -PassThru -RedirectStandardOutput ($env:STAGE_TEST_DIR+'/'+$expected+'.out') -RedirectStandardError ($env:STAGE_TEST_DIR+'/'+$expected+'.err');
      Protect-StageProcessHandle $p;
      if (!$p.WaitForExit(10000)) { $p.Kill(); throw 'Test process timed out' };
      if ($null -eq $p.ExitCode -or $p.ExitCode -ne $expected) { throw 'Incorrect process result' };
    }`;
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    env: { ...process.env, STAGE_TEST_NODE: process.execPath, STAGE_TEST_DIR: directory }, encoding: 'utf8', timeout: 25000,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
});

async function fixture(t, behaviour = 'ok') {
  const counts = { health: 0, list: 0 };
  const server = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/health') { counts.health++; return res.end('{"status":"ok"}'); }
    counts.list++;
    if (!req.headers.authorization) { res.statusCode = 401; return res.end('{}'); }
    if (behaviour === 'later-error' && counts.list > 2) { res.statusCode = 500; return res.end('{}'); }
    if (behaviour === 'timeout') return;
    if (behaviour === 'redirect') { res.writeHead(302, { Location: '/api/health' }); return res.end('{}'); }
    if (behaviour === 'unauthorised') { res.statusCode = 403; return res.end('{}'); }
    if (behaviour === 'server-error') { res.statusCode = 500; return res.end('{}'); }
    if (behaviour === 'malformed') return res.end('not-json');
    if (behaviour === 'empty') return res.end('[]');
    if (behaviour === 'old-envelope') return res.end(JSON.stringify({ items: [{ id: 1, status: 'submitted' }] }));
    res.end(JSON.stringify([{ id: 1, status: 'submitted' }]));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  return { cfg: { ...config, baseUrl: `http://127.0.0.1:${server.address().port}` }, counts };
}

test('configuration refuses remote targets without explicit opt-in', () => {
  assert.throws(() => validateConfig({ ...config, baseUrl: 'https://example.test' }));
  assert.doesNotThrow(() => validateConfig({ ...config, baseUrl: 'https://example.test', allowRemote: true }));
});
test('configuration refuses credentials, query strings and insecure remote HTTP', () => {
  for (const url of ['http://u:p@localhost', 'http://localhost/?token=x', 'http://localhost/path', 'http://example.test']) {
    assert.throws(() => validateConfig({ ...config, baseUrl: url, allowRemote: true }));
  }
});
test('configuration bounds workload and requires candidate identity and token', () => {
  for (const change of [{ users: 51 }, { users: 0 }, { durationMs: NaN }, { warmupMs: -1 },
    { commit: 'main' }, { token: '' }, { datasetCount: 0 }, { timeoutMs: 0 }]) {
    assert.throws(() => validateConfig({ ...config, ...change }));
  }
});
test('nearest-rank p95 and errors use all samples, with strict target comparison', () => {
  const samples = Array.from({ length: 100 }, (_, i) => ({ ms: i + 1, ok: true, status: 200 }));
  const s = summarise(samples, 1000, 96);
  assert.equal(s.p95Ms, 95); assert.equal(s.medianMs, 50); assert.equal(s.status, 'PASS');
  assert.equal(s.throughputPerSecond, 100);
  assert.equal(summarise(samples, 1000, 95).status, 'FAIL');
  samples[0].ok = false;
  assert.equal(summarise(samples, 1000, 96).status, 'FAIL');
  assert.equal(summarise([], 1000, 96).status, 'FAIL');
});
test('smoke checks health, authenticated list and anonymous rejection', async t => {
  const { cfg, counts } = await fixture(t);
  assert.equal((await smoke(cfg)).status, 'PASS');
  assert.deepEqual(counts, { health: 1, list: 2 });
});
for (const behaviour of ['unauthorised', 'server-error', 'malformed', 'empty', 'old-envelope', 'redirect', 'timeout']) {
  test(`preflight blocks load on ${behaviour}`, async t => {
    const { cfg, counts } = await fixture(t, behaviour);
    const result = await runPerformance({ ...cfg, timeoutMs: behaviour === 'timeout' ? 30 : 500 });
    assert.equal(result.status, 'BLOCKED'); assert.equal(result.samples.length, 0);
    assert.equal(counts.health, 1); assert.equal(counts.list, 2);
  });
}
test('performance report excludes warm-up, credentials and response data', async t => {
  const { cfg, counts } = await fixture(t);
  const result = await runPerformance(cfg);
  assert.equal(result.status, 'PASS'); assert.ok(result.summary.total > 0);
  assert.ok(counts.list > result.summary.total + 2);
  assert.match(result.targetAssessment, /cannot claim/);
  assert.equal(JSON.stringify(result).includes(cfg.token), false);
  assert.equal(JSON.stringify(result).includes('submitted'), false);
});
test('warm-up failures block measurement', async t => {
  const { cfg } = await fixture(t, 'later-error');
  const result = await runPerformance(cfg);
  assert.equal(result.status, 'BLOCKED');
  assert.ok(result.warmup.failures > 0);
  assert.deepEqual(result.samples, []);
});
test('errors after successful preflight fail the measured run', async t => {
  const { cfg } = await fixture(t, 'later-error');
  const result = await runPerformance({ ...cfg, warmupMs: 0 });
  assert.equal(result.status, 'FAIL');
  assert.ok(result.summary.failures > 0);
});

function cli(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['tools/m3/run.mjs', ...args], { env: { ...process.env, ...env } });
    let text = '';
    child.stdout.on('data', chunk => { text += chunk; });
    child.stderr.on('data', chunk => { text += chunk; });
    child.on('error', reject);
    child.on('close', code => resolve({ code, text }));
  });
}

test('CLI writes sanitised evidence, refuses overwrite and returns nonzero on failed checks', async t => {
  const { cfg } = await fixture(t);
  const directory = await mkdtemp(join(tmpdir(), 'civicconnect-tool-test-'));
  // Cleanup is restricted to this test's freshly created directory.
  t.after(() => rm(directory, { recursive: true }));
  const output = join(directory, 'report.json');
  const args = ['--base-url', cfg.baseUrl, '--commit', cfg.commit, '--environment', cfg.environment,
    '--dataset-count', '10', '--output', output];
  const first = await cli(args, { M3_STAFF_TOKEN: cfg.token });
  assert.equal(first.code, 0);
  const report = await readFile(output, 'utf8');
  assert.equal(JSON.parse(report).status, 'PASS');
  assert.equal(report.includes(cfg.token), false);
  const duplicate = await cli(args, { M3_STAFF_TOKEN: cfg.token });
  assert.equal(duplicate.code, 1);
  assert.equal(await readFile(output, 'utf8'), report);
  const { cfg: failing } = await fixture(t, 'server-error');
  const failed = await cli(['--base-url', failing.baseUrl, '--commit', cfg.commit, '--environment', cfg.environment,
    '--dataset-count', '10', '--output', join(directory, 'failed.json')], { M3_STAFF_TOKEN: cfg.token });
  assert.equal(failed.code, 1);
  assert.equal(JSON.parse(await readFile(join(directory, 'failed.json'), 'utf8')).status, 'FAIL');
});
