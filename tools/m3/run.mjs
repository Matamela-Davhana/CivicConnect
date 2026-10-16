import { parseArgs } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { validateConfig, smoke, runPerformance } from './checks.mjs';

const help = `M3 release checks (Node 24+, no extra packages)
node tools/m3/run.mjs --mode smoke|performance --base-url http://127.0.0.1:3000
  --commit <full SHA> --environment <label> --dataset-count <verified count>
  [--users 50] [--duration-seconds 300] [--warmup-seconds 60]
  [--think-ms 2000] [--timeout-ms 10000] [--target-ms 2000]
  [--allow-remote] [--output <new report path>]
Set M3_STAFF_TOKEN securely in the environment. Never put it in a command argument.
Remote testing requires explicit team permission and a dedicated test environment.
Reports do not contain tokens or response bodies. Existing reports are not overwritten.`;

try {
  const { values: v } = parseArgs({ options: {
    help: { type: 'boolean' }, mode: { type: 'string', default: 'smoke' },
    'base-url': { type: 'string', default: 'http://127.0.0.1:3000' },
    commit: { type: 'string' }, environment: { type: 'string' },
    'dataset-count': { type: 'string' }, users: { type: 'string', default: '50' },
    'duration-seconds': { type: 'string', default: '300' },
    'warmup-seconds': { type: 'string', default: '60' },
    'think-ms': { type: 'string', default: '2000' },
    'timeout-ms': { type: 'string', default: '10000' },
    'target-ms': { type: 'string', default: '2000' },
    'allow-remote': { type: 'boolean', default: false }, output: { type: 'string' }
  } });
  if (v.help) {
    console.log(help);
  } else {
    if (!['smoke', 'performance'].includes(v.mode)) throw new Error('Mode must be smoke or performance.');
    const config = validateConfig({
      baseUrl: v['base-url'], commit: v.commit, environment: v.environment,
      token: process.env.M3_STAFF_TOKEN, allowRemote: v['allow-remote'],
      datasetCount: Number(v['dataset-count']), users: Number(v.users),
      durationMs: Number(v['duration-seconds']) * 1000, warmupMs: Number(v['warmup-seconds']) * 1000,
      thinkMs: Number(v['think-ms']), timeoutMs: Number(v['timeout-ms']), targetMs: Number(v['target-ms'])
    });
    const startedAt = new Date().toISOString();
    const output = v.output || `artifacts/m3/${v.mode}-${startedAt.replaceAll(':', '-')}.json`;
    await mkdir(dirname(output), { recursive: true });
    // Reserve evidence name before making network requests, never replace earlier results.
    await writeFile(output, JSON.stringify({ status: 'INCOMPLETE', startedAt }), { flag: 'wx' });
    const result = await (v.mode === 'smoke' ? smoke(config) : runPerformance(config));
    const { token: _token, ...publicConfig } = config;
    const report = {
      schemaVersion: 1, mode: v.mode, startedAt, finishedAt: new Date().toISOString(),
      nodeVersion: process.version, config: publicConfig,
      provenance: 'Commit and dataset count are operator declarations; link independent deployment and SQL count evidence.',
      ...result
    };
    await writeFile(output, JSON.stringify(report, null, 2) + '\n');
    console.log(`${report.status}: ${output}`);
    process.exitCode = report.status === 'PASS' ? 0 : 1;
  }
} catch {
  // Parser/network errors can contain supplied values. Keep diagnostics credential-safe.
  console.error('M3 check failed. Check arguments, permissions and environment; run --help. Any INCOMPLETE report is not pass evidence.');
  process.exitCode = 1;
}
