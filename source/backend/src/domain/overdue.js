const OPEN_STATUSES = ['accepted', 'assigned', 'in_progress', 'on_hold'];

const isOverdue = ({ status, targetResolutionDate }, today) =>
  Boolean(targetResolutionDate) && OPEN_STATUSES.includes(status) && targetResolutionDate < today;

module.exports = { isOverdue };
