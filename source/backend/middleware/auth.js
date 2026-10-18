const jwt = require('jsonwebtoken');
const { loadSession } = require('../services/account-session');

function auth(requiredRole) {
  return async (req, res, next) => {
    const header = req.headers['authorization'];
    if (!header) return res.status(401).json({ error: 'No token' });

    const match = /^Bearer (\S+)$/i.exec(header);
    if (!match) return res.status(401).json({ error: 'Invalid token' });
    let decoded;
    try {
      decoded = jwt.verify(match[1], process.env.JWT_SECRET, { algorithms: ['HS256'] });
    } catch (err) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    if (requiredRole && decoded.role !== requiredRole) return res.status(403).json({ error: 'Forbidden' });
    try {
      req.user = await loadSession(decoded);
      if (!req.user) return res.status(401).json({ message: 'Your session has expired. Sign in again.' });
    } catch {
      return res.status(500).json({ message: 'Could not verify your session. Please try again.' });
    }
    next();
  };
}

module.exports = auth;
