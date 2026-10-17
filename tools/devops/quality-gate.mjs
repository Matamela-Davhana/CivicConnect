import path from 'node:path';
import { pathToFileURL } from 'node:url';
export const requiredJobs = ['pipeline-tools', 'frontend', 'backend', 'browser-e2e', 'dependency-audit', 'secrets'];

export function evaluateGate(results) {
  if (!results || typeof results !== 'object' || Array.isArray(results)) throw new Error('Expected the complete job-results object');
  return requiredJobs.filter((job) => results[job]?.result !== 'success');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const failed = evaluateGate(JSON.parse(process.env.CI_JOB_RESULTS || 'null'));
    if (failed.length) {
      console.error(`BLOCKED: required checks failed, were skipped/cancelled, or are absent: ${failed.join(', ')}`);
      process.exitCode = 1;
    } else console.log('All required checks passed. This is not deployment approval or release sign-off.');
  } catch { console.error('BLOCKED: missing or invalid CI job results'); process.exitCode = 1; }
}
