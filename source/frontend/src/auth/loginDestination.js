import { HOME_BY_ROLE, ROLES } from '../constants'

// A remembered destination may belong to an old role after an administrator
// changes the account. It is a navigation hint, never authorization evidence.
export function loginDestination(role, pathname) {
  const home = HOME_BY_ROLE[role] ?? '/'
  if (pathname === home) return home
  if (role === ROLES.REQUESTER && pathname === '/requests/new') return pathname
  if ([ROLES.REQUESTER, ROLES.STAFF].includes(role) && typeof pathname === 'string' &&
      /^\/requests\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(pathname)) return pathname
  return home
}
