export const ROLES = Object.freeze({
  REQUESTER: 'requester',
  STAFF: 'staff',
  MANAGEMENT: 'management',
  ADMIN: 'admin',
})

export const ROLE_LABELS = {
  requester: 'Requester',
  staff: 'Staff',
  management: 'Management',
  admin: 'Administrator',
}

export const HOME_BY_ROLE = {
  requester: '/requests',
  staff: '/staff',
  management: '/management',
  admin: '/admin',
}

export const NAV_BY_ROLE = {
  requester: [
    { to: '/requests', label: 'My requests' },
    { to: '/requests/new', label: 'Submit a request' },
  ],
  staff: [{ to: '/staff', label: 'Staff dashboard' }],
  management: [{ to: '/management', label: 'Management dashboard' }],
  admin: [{ to: '/admin', label: 'Admin management' }],
}

// Align these keys with the status model in the PED (section on the request lifecycle).
export const STATUS_LABELS = {
  submitted: 'Submitted',
  accepted: 'Accepted',
  in_progress: 'In progress',
  completed: 'Completed',
  rejected: 'Rejected',
}

export const CLOSED_STATUSES = ['completed', 'rejected']

export const DESCRIPTION_MIN_LENGTH = 10
export const DESCRIPTION_MAX_LENGTH = 1000

export function isOtherCategory(category) {
  return category?.isOther === true || category?.name?.trim().toLowerCase() === 'other'
}
