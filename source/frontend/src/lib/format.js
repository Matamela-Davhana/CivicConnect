import { CLOSED_STATUSES } from '../constants'

const dateFormat = new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })
const dateTimeFormat = new Intl.DateTimeFormat('en-ZA', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

function toDate(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatDate(value) {
  const date = toDate(value)
  return date ? dateFormat.format(date) : '—'
}

export function formatDateTime(value) {
  const date = toDate(value)
  return date ? dateTimeFormat.format(date) : '—'
}

export function isOverdue(request) {
  if (typeof request.overdue === 'boolean') return request.overdue
  const target = toDate(request.targetDate)
  if (!target || CLOSED_STATUSES.includes(request.status)) return false
  target.setHours(23, 59, 59, 999)
  return target < new Date()
}
