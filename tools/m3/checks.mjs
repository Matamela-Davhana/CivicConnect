import { performance } from 'node:perf_hooks';
import { setTimeout as sleep } from 'node:timers/promises';

export function validateConfig(config) {
  const url = new URL(config.baseUrl);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('Use an origin only, without credentials, path, query or fragment.');
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (!['http:', 'https:'].includes(url.protocol) || (!local && url.protocol !== 'https:')) {
    throw new Error('Remote targets require HTTPS.');
  }
  if (!local && config.allowRemote !== true) {
    throw new Error('Remote tests require explicit permission: --allow-remote against a team-owned test environment.');
  }
  if (!/^[a-f0-9]{40}$/i.test(config.commit || '')) throw new Error('Supply the full 40-character candidate commit.');
  if (!config.environment?.trim()) throw new Error('Supply an environment label.');
  if (!config.token?.trim() || /[\r\n]/.test(config.token)) throw new Error('Set M3_STAFF_TOKEN to a staff test-account token.');
  for (const [key, min, max] of [
    ['users', 1, 50], ['durationMs', 1, 600000], ['warmupMs', 0, 120000],
    ['thinkMs', 0, 60000], ['timeoutMs', 1, 30000], ['targetMs', 1, 60000],
    ['datasetCount', 1, 1000000]
  ]) {
    if (!Number.isInteger(config[key]) || config[key] < min || config[key] > max) {
      throw new Error(`${key} must be an integer between ${min} and ${max}.`);
    }
  }
  return { ...config, baseUrl: url.origin };
}

// Never return server bodies, credentials or raw exception messages in evidence.
async function request(config, path, token, validator) {
  const start = performance.now();
  let status = null;
  try {
    const res = await fetch(config.baseUrl + path, {
      headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      redirect: 'error',
      signal: AbortSignal.timeout(config.timeoutMs)
    });
    status = res.status;
    const body = await res.json();
    return { ms: performance.now() - start, status, ok: validator(status, body) === true };
  } catch {
    return { ms: performance.now() - start, status, ok: false };
  }
}

const validList = (status, body) => status === 200 && Array.isArray(body?.items)
  && body.items.length > 0
  && body.items.every(item => item && typeof item === 'object' && item.id != null && typeof item.status === 'string');

export async function smoke(config) {
  config = validateConfig(config);
  const health = await request(config, '/api/health', null, status => status === 200);
  const staffList = await request(config, '/api/staff/requests', config.token, validList);
  const anonymous = await request(config, '/api/staff/requests', null, status => status === 401);
  return {
    status: health.ok && staffList.ok && anonymous.ok ? 'PASS' : 'FAIL',
    checks: { health, staffList, anonymous },
    limitation: 'API smoke only; does not prove browser journeys, database integrity or deployed commit identity.'
  };
}

export function summarise(samples, elapsedMs, targetMs) {
  const ordered = samples.map(s => s.ms).sort((a, b) => a - b);
  const percentile = p => ordered.length ? ordered[Math.ceil(p * ordered.length) - 1] : null;
  const failures = samples.filter(s => !s.ok).length;
  const statuses = {};
  for (const sample of samples) {
    const key = sample.status ?? 'network-or-timeout';
    statuses[key] = (statuses[key] || 0) + 1;
  }
  return {
    total: samples.length, failures,
    errorRate: samples.length ? failures / samples.length : null,
    medianMs: percentile(0.5), p95Ms: percentile(0.95), maxMs: ordered.at(-1) ?? null,
    throughputPerSecond: elapsedMs > 0 ? samples.length / (elapsedMs / 1000) : 0,
    elapsedMs, statuses,
    status: samples.length && failures === 0 && percentile(0.95) < targetMs ? 'PASS' : 'FAIL'
  };
}

export async function runPerformance(config) {
  config = validateConfig(config);
  // Fail early on missing API, wrong credentials or missing fixtures. Do not hammer a broken target.
  const preflight = await smoke(config);
  if (preflight.status !== 'PASS') return { status: 'BLOCKED', preflight, samples: [] };
  async function phase(durationMs) {
    const start = performance.now();
    const deadline = start + durationMs;
    const samples = [];
    if (durationMs > 0) await Promise.all(Array.from({ length: config.users }, async () => {
      while (performance.now() < deadline) {
        const sample = await request(config, '/api/staff/requests', config.token, validList);
        samples.push(sample);
        const remaining = deadline - performance.now();
        if (remaining > 0 && config.thinkMs) await sleep(Math.min(config.thinkMs, remaining));
      }
    }));
    return { samples, elapsedMs: performance.now() - start };
  }
  const warmup = await phase(config.warmupMs);
  if (warmup.samples.some(s => !s.ok)) {
    return { status: 'BLOCKED', preflight, warmup: summarise(warmup.samples, warmup.elapsedMs, config.targetMs), samples: [] };
  }
  const measured = await phase(config.durationMs);
  const summary = summarise(measured.samples, measured.elapsedMs, config.targetMs);
  return {
    status: summary.status, preflight, summary, samples: measured.samples,
    targetAssessment: config.users === 50 && config.datasetCount === 10000
      ? 'Workload matches the selected M2 concurrency/data size, subject to independent dataset verification.'
      : 'Reduced or different workload: cannot claim the M2 50-user/10,000-record target was verified.',
    limitation: 'Closed-loop, one shared staff identity, one API operation; no browser rendering, varied-user access pattern, sustained soak or production capacity claim.'
  };
}
