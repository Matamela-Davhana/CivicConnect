import { Navigate, Outlet, useLocation } from 'react-router-dom'
import UnauthorisedPage from '../pages/UnauthorisedPage'
import { useAuth } from './useAuth'

// Layout route: signed-out visitors go to sign in; wrong-role users see a clear "no access" page.
export default function RequireRole({ roles }) {
  const { user } = useAuth()
  const location = useLocation()

  if (!user) return <Navigate to="/login" replace state={{ from: location }} />
  if (roles && !roles.includes(user.role)) return <UnauthorisedPage />
  return <Outlet />
}
