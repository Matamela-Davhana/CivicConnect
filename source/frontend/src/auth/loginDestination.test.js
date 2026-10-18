import { describe, expect, it } from 'vitest'
import { loginDestination } from './loginDestination'

describe('role-aware login destinations', () => {
  it.each([
    ['staff', '/requests', '/staff'], ['requester', '/staff', '/requests'],
    ['management', '/admin', '/management'], ['admin', '/management', '/admin'],
    ['requester', '/requests/new', '/requests/new'], ['staff', '/requests/new', '/staff'],
    ['requester', '//example.test', '/requests'], ['staff', '/login', '/staff'],
    ['admin', undefined, '/admin'],
  ])('%s uses a permitted destination instead of %s', (role, from, expected) => {
    expect(loginDestination(role, from)).toBe(expected)
  })
  const detail = '/requests/00000000-0000-4000-8000-000000000001'
  it('retains request-detail deep links only for requester/staff roles', () => {
    for (const role of ['requester', 'staff']) expect(loginDestination(role, detail)).toBe(detail)
    expect(loginDestination('management', detail)).toBe('/management')
    expect(loginDestination('admin', detail)).toBe('/admin')
  })
})
