const path = require('path');

const src = (...parts) => path.join(__dirname, '..', '..', 'src', ...parts);

const STATUSES = [
  'submitted',
  'accepted',
  'assigned',
  'in_progress',
  'on_hold',
  'resolved',
  'closed',
  'rejected'
];

const PERMITTED = {
  submitted: ['accepted', 'rejected'],
  accepted: ['assigned', 'rejected'],
  assigned: ['in_progress'],
  in_progress: ['on_hold', 'resolved'],
  on_hold: ['in_progress', 'resolved'],
  resolved: ['closed', 'in_progress'],
  closed: [],
  rejected: []
};

const OPEN_STATUSES = ['submitted', 'accepted', 'assigned', 'in_progress', 'on_hold'];

const routes = {
  health: () => '/api/health',
  login: () => '/api/auth/login',
  requests: () => '/api/requests',
  myRequests: () => '/api/requests/mine',
  request: (id) => `/api/requests/${id}`,
  accept: (id) => `/api/requests/${id}/accept`,
  assign: (id) => `/api/requests/${id}/assign`,
  status: (id) => `/api/requests/${id}/status`,
  entries: (id) => `/api/requests/${id}/entries`,
  timeline: (id) => `/api/requests/${id}/timeline`,
  staffRequests: () => '/api/staff/requests',
  managementSummary: () => '/api/management/summary',
  managementRequests: () => '/api/management/requests'
};

const http = {
  ok: 200,
  created: 201,
  badRequest: 400,
  unauthenticated: 401,
  forbidden: 403,
  notFound: 404,
  staleVersion: 409,
  invalidTransition: 422,
  serverError: 500
};

const domain = {
  transitions: () => require(src('domain', 'statusTransitions')),
  overdue: () => require(src('domain', 'overdue')),
  submission: () => require(src('domain', 'submission')),
  visibility: () => require(src('domain', 'visibility'))
};

const loadApp = () => {
  const loaded = require(src('app'));
  return loaded.app || loaded.default || loaded;
};

const password = () => require(src('auth', 'password'));

const isoDate = (offsetDays = 0) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
};

module.exports = {
  STATUSES,
  PERMITTED,
  OPEN_STATUSES,
  routes,
  http,
  domain,
  loadApp,
  password,
  isoDate
};
