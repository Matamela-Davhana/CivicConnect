import { useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import ErrorSummary from '../components/ErrorSummary'
import { Field } from '../components/FormFields'
import { loginDestination } from '../auth/loginDestination'
import { usePageTitle } from '../hooks/usePageTitle'

export default function LoginPage() {
  usePageTitle('Sign in')
  const { user, login } = useAuth()
  const location = useLocation()
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [submitting, setSubmitting] = useState(false)

  if (user) {
    const destination = loginDestination(user.role, location.state?.from?.pathname)
    return <Navigate to={destination} replace />
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const email = String(data.get('email') ?? '').trim()
    const password = String(data.get('password') ?? '')

    const next = {}
    if (!email) next.email = 'Enter your email address.'
    else if (!/^\S+@\S+\.\S+$/.test(email)) next.email = 'Enter an email address in the format name@example.com.'
    if (!password) next.password = 'Enter your password.'

    setErrors(next)
    setFormError('')
    setAttempt((value) => value + 1)
    if (Object.keys(next).length > 0) return

    setSubmitting(true)
    try {
      await login(email, password)
    } catch (error) {
      setFormError(error.status === 401 ? 'The email address or password is incorrect.' : error.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="narrow">
      <h1>Sign in</h1>
      <p className="lead">Sign in to report a problem, follow a request or manage the service queue.</p>
      <ErrorSummary errors={errors} attempt={attempt} />
      {formError && (
        <p className="alert alert--error" role="alert">
          {formError}
        </p>
      )}
      <form onSubmit={handleSubmit} noValidate aria-busy={submitting}>
        <Field id="email" label="Email address" type="email" autoComplete="email" error={errors.email} required />
        <Field
          id="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          error={errors.password}
          required
        />
        <button type="submit" className="btn" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
