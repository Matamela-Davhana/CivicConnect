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

const canTransition = (from, to) =>
  Object.prototype.hasOwnProperty.call(PERMITTED, from) && PERMITTED[from].includes(to);

module.exports = { canTransition, PERMITTED };
