// These suites intentionally COMMIT synthetic data. Never run on the review DB.
function assertDisposable(env, browser = false) {
  if (env.NODE_ENV !== 'test' || env.ALLOW_DISPOSABLE_E2E !== '1') {
    throw new Error('E2E requires NODE_ENV=test and ALLOW_DISPOSABLE_E2E=1');
  }
  const db = new URL(env.DATABASE_URL);
  if (!['postgres:', 'postgresql:'].includes(db.protocol) ||
      !['127.0.0.1', 'localhost', '[::1]'].includes(db.hostname) || db.pathname !== '/civicconnect_test') {
    throw new Error('E2E requires the loopback-only disposable civicconnect_test database');
  }
  for (const name of browser ? ['BASE_URL', 'E2E_BASE_URL'] : ['BASE_URL']) {
    const url = new URL(env[name]);
    if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
        url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      throw new Error(`${name} must be a plain loopback HTTP origin`);
    }
  }
}
module.exports = { assertDisposable };
