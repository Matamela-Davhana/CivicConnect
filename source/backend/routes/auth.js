const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Buffer } = require('node:buffer');
const db = require('../db');
const router = express.Router();

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || email.length > 255 || typeof password !== 'string' || !password || Buffer.byteLength(password, 'utf8') > 72) {
    return res.status(400).json({ message: 'Enter your email address and password.' });
  }
  const result = await db.query('SELECT id, name, email, password_hash, role, active, token_version FROM users WHERE lower(btrim(email))=$1', [email.trim().toLowerCase()]);
  const user = result.rows[0];

  if (!user || !user.active || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign(
    { id: user.id, role: user.role, tokenVersion: user.token_version },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );

  // Updated response to include nested user.role
  res.json({
    token,
    role: user.role, // top-level role
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role // nested role for contract compatibility
    }
  });
});

module.exports = router;
