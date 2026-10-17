import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '../App'
import AuthProvider from '../auth/AuthProvider'
import { SESSION_KEY } from '../auth/session'

export const people = {
  requester: { id: 'u-req', name: 'Thandi Mokoena', role: 'requester' },
  staff: { id: 'u-staff', name: 'Sipho Dlamini', role: 'staff' },
  management: { id: 'u-mgmt', name: 'Aisha Patel', role: 'management' },
  admin: { id: 'u-admin', name: 'Naledi Khumalo', role: 'admin' },
}

/** Renders the whole app at `route`, optionally signed in as one of `people`. */
export function renderApp({ route = '/', user = null } = {}) {
  if (user) sessionStorage.setItem(SESSION_KEY, JSON.stringify({ token: 'test-token', user }))
  else sessionStorage.removeItem(SESSION_KEY)

  return render(
    <MemoryRouter initialEntries={[route]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  )
}
