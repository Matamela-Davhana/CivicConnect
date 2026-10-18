// Route unit tests isolate SQL for the route being tested. Session revocation is
// tested separately with the real middleware/service and in PostgreSQL integration.
function stubAccountSessions(t) {
  const path = require.resolve('../../services/account-session');
  const previous = require.cache[path];
  require.cache[path] = { id: path, filename: path, loaded: true, exports: {
    loadSession: async (claims) => ({ id: claims.id, role: claims.role, tokenVersion: claims.tokenVersion ?? 0 }),
  } };
  t.after(() => { if (previous) require.cache[path] = previous; else delete require.cache[path]; });
}
module.exports = { stubAccountSessions };
