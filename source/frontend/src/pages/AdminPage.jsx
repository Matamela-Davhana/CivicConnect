import { useAuth } from '../auth/useAuth'
import { usePageTitle } from '../hooks/usePageTitle'
import CategoriesPanel from './admin/CategoriesPanel'
import UsersPanel from './admin/UsersPanel'

export default function AdminPage() {
  usePageTitle('Admin management')
  const { user } = useAuth()
  return (
    <>
      <h1>Admin management</h1>
      <p className="lead">Manage who can use CivicConnect and which categories residents can choose.</p>
      <UsersPanel currentUserId={user.id} />
      <CategoriesPanel />
    </>
  )
}
