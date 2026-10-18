const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const router = express.Router();

router.get('/requests', auth('staff'), async (req, res) => {
  const { status, category_id } = req.query;
  let query = 'SELECT * FROM service_requests WHERE 1=1';
  let params = [];
  if (status) { params.push(status); query += ` AND status=$${params.length}`; }
  if (category_id) { params.push(category_id); query += ` AND category_id=$${params.length}`; }
  const result = await db.query(query, params);
  res.json(result.rows);
});

router.put('/requests/:id/status', auth('staff'), async (req, res) => {
  const { newStatus } = req.body;
  await db.query(
    'INSERT INTO status_history (request_id, old_status, new_status, changed_by) SELECT id, status, $1, $2 FROM service_requests WHERE id=$3',
    [newStatus, req.user.id, req.params.id]
  );
  const result = await db.query(
    'UPDATE service_requests SET status=$1, row_version=row_version+1 WHERE id=$2 RETURNING *',
    [newStatus, req.params.id]
  );
  res.json(result.rows[0]);
});

module.exports = router;