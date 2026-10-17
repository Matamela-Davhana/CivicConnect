// Single place that describes every backend call the UI makes.
// Paths and payload shapes are documented in document/Frontend/README.md
// and must be agreed with the backend owner before M3 is frozen.
import { request } from './client'

function query(params = {}) {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value)
  })
  const text = search.toString()
  return text ? `?${text}` : ''
}

const id = encodeURIComponent

export const api = {
  auth: {
    login: (body) => request('/auth/login', { method: 'POST', body }),
  },
  categories: {
    list: (signal) => request('/categories', { signal }),
  },
  requests: {
    listMine: (signal) => request('/requests/mine', { signal }),
    get: (requestId, signal) => request(`/requests/${id(requestId)}`, { signal }),
    create: (body) => request('/requests', { method: 'POST', body }),
    act: (requestId, body) => request(`/requests/${id(requestId)}/actions`, { method: 'POST', body }),
  },
  staff: {
    queue: (filters, signal) => request(`/staff/requests${query(filters)}`, { signal }),
    assignees: (signal) => request('/staff/assignees', { signal }),
  },
  management: {
    summary: (signal) => request('/management/summary', { signal }),
  },
  admin: {
    users: {
      list: (signal) => request('/admin/users', { signal }),
      create: (body) => request('/admin/users', { method: 'POST', body }),
      update: (userId, body) => request(`/admin/users/${id(userId)}`, { method: 'PATCH', body }),
    },
    categories: {
      list: (signal) => request('/admin/categories', { signal }),
      create: (body) => request('/admin/categories', { method: 'POST', body }),
      update: (categoryId, body) => request(`/admin/categories/${id(categoryId)}`, { method: 'PATCH', body }),
    },
  },
}
