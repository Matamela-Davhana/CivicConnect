const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const router = express.Router();

router.get('/overview', auth('management'), async (req, res) => {
  const result = await db.query('SELECT status, COUNT(*) as count FROM service_requests GROUP BY status');
  res.json({ summary: result.rows });
});

module.exports = router;