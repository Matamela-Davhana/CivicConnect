import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

export async function waitReady(url, kind, { timeoutMs = 30000, requestMs = 2000, intervalMs = 500, fetchImpl = fetch } = {}) {
  const target = new URL(url);
  if (target.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname) || target.username || target.password || target.search) throw new Error('CI readiness probes must use an uncredentialed loopback HTTP URL');
  if (!['api', 'web'].includes(kind)) throw new Error('Probe kind must be api or web');
  const deadline = Date.now() + timeoutMs;
  do {
    const remaining = Math.max(1, deadline - Date.now());
    try {
      const response = await fetchImpl(target, { redirect: 'error', signal: AbortSignal.timeout(Math.min(requestMs, remaining)) });
      if (response.status === 200) {
        if (kind === 'web' && response.headers.get('content-type')?.includes('text/html')) {
          await response.body?.cancel();
          return true;
        }
        if (kind === 'api' && response.headers.get('content-type')?.includes('application/json') && (await response.json()).status === 'ok') return true;
      }
      await response.body?.cancel().catch(() => {});
    } catch { /* Startup failures are retried only within the fixed deadline. */ }
    if (Date.now() >= deadline) break;
    await delay(Math.min(intervalMs, deadline - Date.now()));
  } while (Date.now() < deadline);
  throw new Error(`${kind} did not become ready before the timeout`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  waitReady(process.argv[2], process.argv[3]).then(() => console.log('Readiness probe passed')).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
