const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const { SUMMARY_SQL } = require('../services/management-summary');
const router = express.Router();

router.get('/summary', auth('management'), async (req, res) => {
  try {
    const result = await db.query(SUMMARY_SQL);
    res.json(result.rows[0].summary);
  } catch {
    res.status(500).json({ message: 'Could not load the management summary. Please try again.' });
  }
});

router.get('/overview', auth('management'), async (req, res) => {
  try {
    const result = await db.query('SELECT status, COUNT(*) as count FROM service_requests GROUP BY status ORDER BY status');
    res.json({ summary: result.rows });
  } catch {
    res.status(500).json({ message: 'Could not load the management summary. Please try again.' });
  }
});

module.exports = router;
