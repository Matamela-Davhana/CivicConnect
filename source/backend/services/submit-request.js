const { randomBytes } = require('node:crypto');

class ValidationError extends Error {
  constructor(errors) {
    super('Check the highlighted fields and try again.');
    this.errors = errors;
  }
}

function validateSubmission(body) {
  const input = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const errors = {};
  const categoryId = typeof input.categoryId === 'string' ? input.categoryId : '';
  const description = typeof input.description === 'string' ? input.description.trim() : '';
  const otherExplanation = typeof input.otherExplanation === 'string' ? input.otherExplanation.trim() : '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(categoryId)) {
    errors.category = 'Select a valid category.';
  }
  if (description.length < 10) errors.description = 'Describe the problem in at least 10 characters.';
  else if (description.length > 1000) errors.description = 'Shorten the description to 1000 characters or fewer.';
  if (input.otherExplanation !== undefined && typeof input.otherExplanation !== 'string') {
    errors.otherExplanation = 'Enter an explanation as text.';
  } else if (otherExplanation.length > 1000) {
    errors.otherExplanation = 'Shorten the explanation to 1000 characters or fewer.';
  }
  if (Object.keys(errors).length) throw new ValidationError(errors);
  return { categoryId, description, otherExplanation };
}

async function submitRequest(db, input, requesterId, makeReference = () => `CC-${randomBytes(8).toString('hex').toUpperCase()}`) {
  const client = await db.connect();
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await client.query('BEGIN');
        // Prevent a concurrent category disable while this request is being saved.
        const category = (await client.query('SELECT id, name, active FROM categories WHERE id=$1 FOR SHARE', [input.categoryId])).rows[0];
        if (!category || !category.active) throw new ValidationError({ category: 'Select an available category.' });
        const isOther = category.name.trim().toLowerCase() === 'other';
        if (isOther && !input.otherExplanation) {
          throw new ValidationError({ otherExplanation: 'Explain what kind of problem this is, because you selected “Other”.' });
        }
        const created = (await client.query(`
          INSERT INTO service_requests (reference, category_id, description, other_explanation, status, requester_id)
          VALUES ($1,$2,$3,$4,'submitted',$5) RETURNING id, reference
        `, [makeReference(), input.categoryId, input.description, isOther ? input.otherExplanation : null, requesterId])).rows[0];
        await client.query(`INSERT INTO status_history (request_id, old_status, new_status, changed_by)
          VALUES ($1,NULL,'submitted',$2)`, [created.id, requesterId]);
        await client.query('COMMIT');
        return created;
      } catch (error) {
        await client.query('ROLLBACK');
        if (error.code === '23505' && error.constraint === 'service_requests_reference_key' && attempt < 2) continue;
        throw error;
      }
    }
  } finally {
    client.release();
  }
}

module.exports = { ValidationError, validateSubmission, submitRequest };
