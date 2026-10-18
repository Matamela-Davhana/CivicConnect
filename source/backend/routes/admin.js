const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const admin = require('../services/admin-management');
const router = express.Router();
router.use(auth('admin'));

function failure(res, error) {
  if (error instanceof admin.AdminError) return res.status(error.status).json({ message: error.message });
  if (error.code === '23505') return res.status(409).json({ message: 'That email address or category name already exists.' });
  return res.status(500).json({ message: 'Could not complete the admin operation. Please refresh and try again.' });
}
router.get('/users', async (req, res) => {
  try { res.json((await db.query(`SELECT ${admin.USER_FIELDS} FROM users ORDER BY name, id`)).rows); }
  catch (error) { failure(res, error); }
});
router.get('/categories', async (req, res) => {
  try { res.json((await db.query('SELECT id, name, active FROM categories ORDER BY name, id')).rows); }
  catch (error) { failure(res, error); }
});
for (const [resource, create, update] of [
  ['users', admin.createUser, admin.updateUser], ['categories', admin.createCategory, admin.updateCategory],
]) {
  router.post(`/${resource}`, async (req, res) => {
    try { res.status(201).json(await create(db, req.body, req.user)); }
    catch (error) { failure(res, error); }
  });
  router.patch(`/${resource}/:id`, async (req, res) => {
    try { res.json(await update(db, req.params.id, req.body, req.user)); }
    catch (error) { failure(res, error); }
  });
}
module.exports = router;
