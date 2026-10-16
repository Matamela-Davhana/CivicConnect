const request = require('supertest');
const app = require('../src/app');

describe('Black-box functional tests', () => {

  // 1. State Transition: Submitted → Accepted
  it('should allow transition from Submitted to Accepted', async () => {
    const res = await request(app)
      .post('/submit')
      .send({ category: 'Facility Fault', description: 'Broken chair' });
    expect(res.statusCode).toBe(200);
    const id = res.body.id;

    const transition = await request(app)
      .post(`/status/${id}`)
      .send({ newStatus: 'Accepted' });
    expect(transition.statusCode).toBe(200);
    expect(transition.body.status).toBe('Accepted');
  });

  // 2. Invalid Transition: Submitted → Closed directly
  it('should reject invalid transition Submitted → Closed', async () => {
    const res = await request(app)
      .post('/submit')
      .send({ category: 'Facility Fault', description: 'Broken window' });
    const id = res.body.id;

    const transition = await request(app)
      .post(`/status/${id}`)
      .send({ newStatus: 'Closed' });
    expect(transition.statusCode).toBe(400);
    expect(transition.body.error).toMatch(/Invalid transition/);
  });

  // 3. EP/BVA: Missing category
  it('should reject request without category', async () => {
    const res = await request(app)
      .post('/submit')
      .send({ category: '', description: 'Broken desk' });
    expect(res.statusCode).toBe(400);
    expect(res.body.errors[0].message).toMatch(/Category is required/);
  });

  // 4. EP/BVA: Other category requires explanation
  it('should reject "Other" category with too short description', async () => {
    const res = await request(app)
      .post('/submit')
      .send({ category: 'Other', description: 'x' });
    expect(res.statusCode).toBe(400);
    expect(res.body.errors[0].message).toMatch(/Explain what the request is about/);
  });

  // 5. Privacy Enforcement: Unauthorized access
  it('should block unauthorized user from viewing request', async () => {
    const res = await request(app)
      .get('/requests/12345')
      .set('Authorization', 'Bearer invalidtoken');
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toMatch(/Unauthorized/);
  });

});
