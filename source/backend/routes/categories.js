const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const router = express.Router();

router.get('/', auth(), async (req, res) => {
  if (!['requester', 'staff', 'management', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ message: 'You do not have access to categories.' });
  }
  try {
    const result = await db.query(`SELECT id, name, (lower(trim(name)) = 'other') AS "isOther"
      FROM categories WHERE active = true ORDER BY name ASC, id ASC`);
    res.json(result.rows);
  } catch {
    res.status(500).json({ message: 'Could not load categories. Please try again.' });
  }
});

module.exports = router;
