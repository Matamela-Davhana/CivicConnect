import { Navigate, Route, Routes } from 'react-router-dom'
import RequireRole from './auth/RequireRole'
import { useAuth } from './auth/useAuth'
import Layout from './components/Layout'
import { HOME_BY_ROLE, ROLES } from './constants'
import AdminPage from './pages/AdminPage'
import LoginPage from './pages/LoginPage'
import ManagementDashboardPage from './pages/ManagementDashboardPage'
import MyRequestsPage from './pages/MyRequestsPage'
import NotFoundPage from './pages/NotFoundPage'
import RequestDetailPage from './pages/RequestDetailPage'
import StaffDashboardPage from './pages/StaffDashboardPage'
import SubmitRequestPage from './pages/SubmitRequestPage'

function HomeRedirect() {
  const { user } = useAuth()
  return <Navigate to={user ? (HOME_BY_ROLE[user.role] ?? '/login') : '/login'} replace />
}

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomeRedirect />} />
        <Route path="login" element={<LoginPage />} />

        <Route element={<RequireRole roles={[ROLES.REQUESTER]} />}>
          <Route path="requests" element={<MyRequestsPage />} />
          <Route path="requests/new" element={<SubmitRequestPage />} />
        </Route>

        <Route element={<RequireRole roles={[ROLES.REQUESTER, ROLES.STAFF]} />}>
          <Route path="requests/:id" element={<RequestDetailPage />} />
        </Route>

        <Route element={<RequireRole roles={[ROLES.STAFF]} />}>
          <Route path="staff" element={<StaffDashboardPage />} />
        </Route>

        <Route element={<RequireRole roles={[ROLES.MANAGEMENT]} />}>
          <Route path="management" element={<ManagementDashboardPage />} />
        </Route>

        <Route element={<RequireRole roles={[ROLES.ADMIN]} />}>
          <Route path="admin" element={<AdminPage />} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}

export default App
