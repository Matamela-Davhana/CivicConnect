const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const router = express.Router();

router.post('/', auth('requester'), async (req, res) => {
  const { category_id, description, other_explanation } = req.body;
  const reference = Math.random().toString(36).substring(2, 10).toUpperCase();
  const result = await db.query(
    `INSERT INTO service_requests (reference, category_id, description, other_explanation, status, requester_id)
     VALUES ($1,$2,$3,$4,'submitted',$5) RETURNING *`,
    [reference, category_id, description, other_explanation, req.user.id]
  );
  res.json(result.rows[0]);
});

router.get('/', auth('requester'), async (req, res) => {
  const result = await db.query('SELECT reference, status, description FROM service_requests WHERE requester_id=$1', [req.user.id]);
  res.json(result.rows);
});

// Keep this literal route before /:id so "mine" is never treated as a UUID.
router.get('/mine', auth('requester'), async (req, res) => {
  try {
    const result = await db.query(`
      SELECT r.id, r.reference, c.name AS category, r.status,
             r.submitted_at AS "createdAt",
             GREATEST(
               r.submitted_at,
               (SELECT MAX(h.changed_at) FROM status_history h WHERE h.request_id = r.id),
               (SELECT MAX(e.created_at) FROM request_entries e
                WHERE e.request_id = r.id AND e.entry_type = 'public')
             ) AS "updatedAt"
      FROM service_requests r
      JOIN categories c ON c.id = r.category_id
      WHERE r.requester_id = $1
      ORDER BY r.submitted_at DESC, r.id DESC
    `, [req.user.id]);
    res.json(result.rows);
  } catch {
    res.status(500).json({ message: 'Could not load your requests. Please try again.' });
  }
});

router.get('/:id', auth(), async (req, res) => {
  const request = await db.query('SELECT * FROM service_requests WHERE id=$1', [req.params.id]);
  const history = await db.query('SELECT * FROM status_history WHERE request_id=$1 ORDER BY changed_at ASC', [req.params.id]);
  const entries = await db.query('SELECT * FROM request_entries WHERE request_id=$1 ORDER BY created_at ASC', [req.params.id]);
  res.json({ ...request.rows[0], timeline: history.rows, updates: entries.rows });
});

module.exports = router;
