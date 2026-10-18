const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const { UUID, STATUSES } = require('../services/staff-actions');
const router = express.Router();

router.get('/requests', auth('staff'), async (req, res) => {
  const { status = '', category = '', q = '' } = req.query;
  if ([status, category, q].some((value) => typeof value !== 'string') ||
      (status && !STATUSES.includes(status)) || (category && !UUID.test(category)) || q.length > 100) {
    return res.status(422).json({ message: 'Choose valid status/category filters and a reference search of at most 100 characters.' });
  }
  try {
    const result = await db.query(`SELECT r.id, r.reference, c.name AS category, r.status,
      r.submitted_at AS "createdAt", r.target_resolution_date::text AS "targetDate",
      json_build_object('id', requester.id, 'name', requester.name) AS requester,
      CASE WHEN assignee.id IS NULL THEN NULL ELSE json_build_object('id', assignee.id, 'name', assignee.name) END AS assignee
      FROM service_requests r JOIN categories c ON c.id=r.category_id
      JOIN users requester ON requester.id=r.requester_id
      LEFT JOIN users assignee ON assignee.id=r.assignee_id
      WHERE ($1::text='' OR r.status=$1)
        AND ($2::uuid IS NULL OR r.category_id=$2::uuid)
        AND strpos(lower(r.reference), lower($3::text)) > 0
      ORDER BY r.submitted_at DESC, r.id DESC`, [status, category || null, q.trim()]);
    res.json(result.rows);
  } catch {
    res.status(500).json({ message: 'Could not load the staff queue. Please try again.' });
  }
});

router.get('/assignees', auth('staff'), async (req, res) => {
  try {
    res.json((await db.query("SELECT id, name FROM users WHERE role='staff' AND active=true ORDER BY name, id")).rows);
  } catch {
    res.status(500).json({ message: 'Could not load staff members. Please try again.' });
  }
});

// Do not leave the old, non-transactional write path as a version-check bypass.
router.put('/requests/:id/status', auth('staff'), (req, res) => {
  res.status(410).json({ message: 'Use POST /api/requests/:id/actions with the current rowVersion.' });
});

module.exports = router;
