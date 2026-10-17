import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { checkContract } from './ci-contract.mjs';
import { evaluateGate, requiredJobs } from './quality-gate.mjs';
import { waitReady } from './wait-ready.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
function fixture(t, component, scripts) {
  const parent = realpathSync(tmpdir());
  const root = mkdtempSync(path.join(parent, 'civicconnect-ci-test-'));
  t.after(() => {
    const resolved = realpathSync(root);
    assert.equal(path.dirname(resolved), parent);
    assert.ok(path.basename(resolved).startsWith('civicconnect-ci-test-'));
    rmSync(resolved, { recursive: true });
  });
  const folder = path.join(root, 'source', component);
  mkdirSync(folder, { recursive: true });
  writeFileSync(path.join(folder, 'package.json'), JSON.stringify({ scripts }));
  writeFileSync(path.join(folder, 'package-lock.json'), '{}');
  return { root, folder };
}
function addFile(folder, name, content = '') {
  const target = path.join(folder, name);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
}
const backendScripts = { lint: 'eslint .', start: 'node src/server.js', 'test:unit': 'jest --selectProjects unit', 'test:integration': 'jest --selectProjects integration', 'test:e2e': 'jest --selectProjects e2e' };
const complete = () => Object.fromEntries(requiredJobs.map((name) => [name, { result: 'success' }]));

test('gate permits only a complete all-success result', () => assert.deepEqual(evaluateGate(complete()), []));
for (const state of ['failure', 'cancelled', 'skipped', 'neutral', '']) {
  test(`gate blocks ${state || 'empty'} results`, () => {
    const jobs = complete();
    jobs.backend.result = state;
    assert.deepEqual(evaluateGate(jobs), ['backend']);
  });
}
test('gate blocks a missing browser job', () => {
  const jobs = complete(); delete jobs['browser-e2e'];
  assert.deepEqual(evaluateGate(jobs), ['browser-e2e']);
});
test('gate rejects empty or malformed results', () => {
  assert.equal(evaluateGate({}).length, requiredJobs.length);
  for (const value of [null, [], 'success']) assert.throws(() => evaluateGate(value));
});
test('gate CLI actually exits non-zero on a failed check', () => {
  const jobs = complete(); jobs.backend.result = 'failure';
  const result = spawnSync(process.execPath, [path.join(here, 'quality-gate.mjs')], { env: { ...process.env, CI_JOB_RESULTS: JSON.stringify(jobs) }, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /BLOCKED.*backend/);
});

test('frontend contract accepts the existing build/lint interface', (t) => {
  const { root } = fixture(t, 'frontend', { lint: 'eslint .', build: 'vite build' });
  assert.deepEqual(checkContract(root, 'frontend'), []);
});
test('missing backend scripts and test files are reported, not skipped', (t) => {
  const { root } = fixture(t, 'backend', { test: 'echo "Error: no test specified" && exit 1' });
  const errors = checkContract(root, 'backend');
  assert.ok(errors.some((line) => line.includes('test:unit')));
  assert.ok(errors.some((line) => line.includes('tests/e2e')));
  assert.ok(errors.some((line) => line.includes('migration')));
});
for (const command of ['echo done', 'true', 'exit 0', 'jest --passWithNoTests', 'npm run test --if-present', 'jest || true']) {
  test(`contract refuses a placeholder or bypass: ${command}`, (t) => {
    const { root } = fixture(t, 'frontend', { lint: command, build: 'vite build' });
    assert.ok(checkContract(root, 'frontend').some((line) => line.includes('masks')));
  });
}
test('backend contract accepts real script/file structure without claiming tests passed', (t) => {
  const { root, folder } = fixture(t, 'backend', backendScripts);
  for (const name of ['tests/unit/rules.test.js', 'tests/api/request.spec.ts', 'tests/e2e/journey.test.mjs', 'migrations/001_initial_schema.sql']) addFile(folder, name);
  assert.deepEqual(checkContract(root, 'backend'), []);
});
test('browser contract requires a real suite and installer command', (t) => {
  const { root, folder } = fixture(t, 'frontend', { preview: 'vite preview', 'test:e2e': 'playwright test', 'test:e2e:install': 'playwright install --with-deps chromium' });
  assert.ok(checkContract(root, 'browser').length > 0);
  addFile(folder, 'e2e/journey.spec.ts');
  assert.deepEqual(checkContract(root, 'browser'), []);
});
test('contract reports invalid JSON and rejects unknown components', (t) => {
  const { root, folder } = fixture(t, 'frontend', {});
  writeFileSync(path.join(folder, 'package.json'), '{');
  assert.match(checkContract(root, 'frontend')[0], /invalid JSON/);
  assert.throws(() => checkContract(root, 'invented'));
});
test('lockfile is mandatory', (t) => {
  const { root, folder } = fixture(t, 'frontend', { lint: 'eslint .', build: 'vite build' });
  rmSync(path.join(folder, 'package-lock.json'));
  assert.ok(checkContract(root, 'frontend').some((line) => line.includes('package-lock')));
});

const response = (status, type, body) => new Response(body, { status, headers: { 'content-type': type } });
test('API readiness requires healthy JSON, not just HTTP 200', async () => {
  let calls = 0;
  const fetchImpl = async () => ++calls === 1 ? response(200, 'text/html', '<html>wrong app</html>') : response(200, 'application/json', '{"status":"ok"}');
  assert.equal(await waitReady('http://127.0.0.1:3000/api/health', 'api', { fetchImpl, intervalMs: 1 }), true);
  assert.equal(calls, 2);
});
test('web readiness accepts an HTML response', async () => {
  assert.equal(await waitReady('http://127.0.0.1:4173', 'web', { fetchImpl: async () => response(200, 'text/html', '<html>fixture</html>') }), true);
});
for (const make of [() => response(503, 'application/json', '{}'), () => response(200, 'application/json', '{"status":"unhealthy"}'), () => response(200, 'application/json', 'bad json')]) {
  test('unhealthy or invalid API responses time out and fail', async () => {
    await assert.rejects(waitReady('http://127.0.0.1:3000/api/health', 'api', { fetchImpl: async () => make(), timeoutMs: 15, intervalMs: 1 }), /timeout/);
  });
}
for (const url of ['https://production.example.test/health', 'http://user:password@localhost/health', 'http://localhost/health?token=example']) {
  test('readiness refuses remote or credential-bearing URLs', async () => {
    await assert.rejects(waitReady(url, 'api'), /loopback/);
  });
}
test('summary records merge SHA and branch head separately', (t) => {
  const { root } = fixture(t, 'frontend', {});
  const target = path.join(root, 'summary.md');
  const result = spawnSync(process.execPath, [path.join(here, 'write-run-summary.mjs')], { env: { ...process.env, GITHUB_STEP_SUMMARY: target, TESTED_SHA: 'a'.repeat(40), PR_HEAD_SHA: 'b'.repeat(40), RUN_ID: '123' }, encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.match(readFileSync(target, 'utf8'), /temporary merge commit/);
});
test('workflow pins actions, keeps read-only permissions and does not bypass its gate', () => {
  const yaml = readFileSync(path.join(repo, '.github/workflows/restart-ci.yml'), 'utf8');
  const actions = [...yaml.matchAll(/uses:\s+[^@\s]+@([^\s]+)/g)].map((match) => match[1]);
  assert.ok(actions.length > 0);
  assert.ok(actions.every((ref) => /^[a-f0-9]{40}$/.test(ref)));
  assert.match(yaml, /contents: read/);
  assert.doesNotMatch(yaml, /pull_request_target|continue-on-error|--if-present|passWithNoTests|include-hidden-files:\s*true/);
  assert.match(yaml, /quality-gate:[\s\S]*if: always\(\)/);
  for (const job of requiredJobs) assert.match(yaml, new RegExp(`  ${job}:`));
});
