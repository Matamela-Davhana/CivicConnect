const contract = require('./contract');

const baseUrl = () => process.env.BASE_URL || 'http://127.0.0.1:3000';

const call = async (method, url, { token, body } = {}) => {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(baseUrl() + url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return { status: res.status, body: json, text };
};

const login = async (user) => {
  const res = await call('POST', contract.routes.login(), {
    body: { email: user.email, password: user.password }
  });
  if (res.status !== contract.http.ok || !res.body || !res.body.token) {
    throw new Error(`Login failed for ${user.role}: HTTP ${res.status}`);
  }
  return res.body.token;
};

module.exports = { baseUrl, call, login };
