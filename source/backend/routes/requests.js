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

router.get('/:id', auth(), async (req, res) => {
  const request = await db.query('SELECT * FROM service_requests WHERE id=$1', [req.params.id]);
  const history = await db.query('SELECT * FROM status_history WHERE request_id=$1 ORDER BY changed_at ASC', [req.params.id]);
  const entries = await db.query('SELECT * FROM request_entries WHERE request_id=$1 ORDER BY created_at ASC', [req.params.id]);
  res.json({ ...request.rows[0], timeline: history.rows, updates: entries.rows });
});

module.exports = router;
