const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const { ValidationError, validateSubmission, submitRequest } = require('../services/submit-request');
const { StaffActionError, applyStaffAction } = require('../services/staff-actions');
const router = express.Router();

router.post('/:id/actions', auth('staff'), async (req, res) => {
  try {
    res.json(await applyStaffAction(db, req.params.id, req.body, req.user.id));
  } catch (error) {
    if (error instanceof StaffActionError) return res.status(error.status).json({ message: error.message });
    res.status(500).json({ message: 'Could not save the staff action. Please refresh the request before retrying.' });
  }
});

router.post('/', auth('requester'), async (req, res) => {
  try {
    const input = validateSubmission(req.body);
    const created = await submitRequest(db, input, req.user.id);
    res.status(201).json(created);
  } catch (error) {
    if (error instanceof ValidationError) return res.status(422).json({ message: error.message, errors: error.errors });
    res.status(500).json({ message: 'Could not submit your request. Please try again.' });
  }
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
  const isStaff = req.user.role === 'staff';
  if (!isStaff && req.user.role !== 'requester') {
    return res.status(403).json({ message: 'You do not have access to request details.' });
  }
  const id = req.params.id;
  const notFound = { message: 'Request not found.' };
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return res.status(404).json(notFound);
  }
  try {
    const result = await db.query(`
      SELECT r.id, r.reference, c.name AS category, r.status, r.description,
             r.other_explanation AS "otherExplanation", r.submitted_at AS "createdAt",
             r.target_resolution_date::text AS "targetDate", r.row_version AS "rowVersion",
             requester.id AS "requesterId", requester.name AS "requesterName",
             assignee.id AS "assigneeId", assignee.name AS "assigneeName"
      FROM service_requests r
      JOIN categories c ON c.id = r.category_id
      JOIN users requester ON requester.id = r.requester_id
      LEFT JOIN users assignee ON assignee.id = r.assignee_id
      WHERE r.id = $1 AND ($2::boolean OR r.requester_id = $3::uuid)
    `, [id, isStaff, req.user.id]);
    const row = result.rows[0];
    // Do not disclose whether another requester's ID exists, or fetch its timeline.
    if (!row) return res.status(404).json(notFound);
    const timeline = await db.query(`
      SELECT id, visibility, author, message, "createdAt" FROM (
        SELECT 'history-' || h.id::text AS id, 'public' AS visibility, u.name AS author,
          CASE WHEN h.old_status IS NULL THEN 'Request ' || replace(h.new_status, '_', ' ') || '.'
            ELSE 'Status changed from ' || replace(h.old_status, '_', ' ') ||
                 ' to ' || replace(h.new_status, '_', ' ') || '.' END AS message,
          h.changed_at AS "createdAt", CASE WHEN h.old_status IS NULL THEN 0 ELSE 1 END AS event_order
        FROM status_history h JOIN users u ON u.id = h.changed_by
        WHERE h.request_id = $1
        UNION ALL
        SELECT 'entry-' || e.id::text AS id, e.entry_type AS visibility, u.name AS author,
               e.content AS message, e.created_at AS "createdAt", 2 AS event_order
        FROM request_entries e JOIN users u ON u.id = e.author_id
        WHERE e.request_id = $1 AND ($2::boolean OR e.entry_type = 'public')
      ) events ORDER BY "createdAt" ASC, event_order ASC, id ASC
    `, [id, isStaff]);
    const detail = {
      id: row.id, reference: row.reference, category: row.category, status: row.status,
      description: row.description, otherExplanation: row.otherExplanation,
      createdAt: row.createdAt, targetDate: row.targetDate, timeline: timeline.rows,
    };
    if (isStaff) {
      detail.rowVersion = row.rowVersion;
      detail.requester = { id: row.requesterId, name: row.requesterName };
      detail.assignee = row.assigneeId ? { id: row.assigneeId, name: row.assigneeName } : null;
    }
    res.json(detail);
  } catch {
    res.status(500).json({ message: 'Could not load this request. Please try again.' });
  }
});

module.exports = router;
