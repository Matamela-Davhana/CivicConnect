const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db');
const auth = require('../middleware/auth');
const router = express.Router();

router.post('/users', auth('admin'), async (req, res) => {
  const { name, email, password, role } = req.body;
  const hashed = await bcrypt.hash(password, 10);
  const result = await db.query(
    'INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,$3,$4) RETURNING *',
    [name, email, hashed, role]
  );
  res.json(result.rows[0]);
});

router.post('/categories', auth('admin'), async (req, res) => {
  const { name } = req.body;
  const result = await db.query('INSERT INTO categories (name) VALUES ($1) RETURNING *', [name]);
  res.json(result.rows[0]);
});

module.exports = router;
