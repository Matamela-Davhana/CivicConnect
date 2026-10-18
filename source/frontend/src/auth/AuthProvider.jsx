import { useCallback, useMemo, useState } from 'react'
import { api } from '../api'
import { setAuthToken } from '../api/client'
import { AuthContext } from './AuthContext'
import { clearSession, readSession, writeSession } from './session'

export default function AuthProvider({ children }) {
  const [session, setSession] = useState(() => {
    const stored = readSession()
    setAuthToken(stored?.token ?? null)
    return stored
  })

  const login = useCallback(async (email, password) => {
    const { token, user } = await api.auth.login({ email, password })
    const next = { token, user }
    setAuthToken(token)
    writeSession(next)
    setSession(next)
    return user
  }, [])

  const logout = useCallback(() => {
    setAuthToken(null)
    clearSession()
    setSession(null)
  }, [])

  const value = useMemo(() => ({ user: session?.user ?? null, login, logout }), [session, login, logout])

  return <AuthContext value={value}>{children}</AuthContext>
}
