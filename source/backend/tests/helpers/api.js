const request = require('supertest');
const contract = require('./contract');

const login = async (app, user) => {
  const res = await request(app)
    .post(contract.routes.login())
    .send({ email: user.email, password: user.password });
  if (res.status !== contract.http.ok || !res.body.token) {
    throw new Error(`Login failed for ${user.role}: HTTP ${res.status}`);
  }
  return res.body.token;
};

const client = (app, token) => {
  const withAuth = (req) => (token ? req.set('Authorization', `Bearer ${token}`) : req);
  return {
    get: (url) => withAuth(request(app).get(url)),
    post: (url, body) => withAuth(request(app).post(url)).send(body)
  };
};

const actor = async (app, user) => client(app, await login(app, user));

module.exports = { login, client, actor };
