import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'

export function LoadingState({ label = 'Loading' }) {
  return (
    <div className="state" role="status">
      <span className="spinner" aria-hidden="true" />
      <p>{label}…</p>
    </div>
  )
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="state state--error" role="alert">
      <h2>We could not load this page</h2>
      <p>{error?.message ?? 'Something went wrong.'}</p>
      {onRetry && (
        <button type="button" className="btn" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  )
}

export function EmptyState({ title, children }) {
  return (
    <div className="state">
      <h2>{title}</h2>
      {children}
    </div>
  )
}

export function NotFoundState() {
  return (
    <div className="state" role="alert">
      <h2>We could not find that</h2>
      <p>It may have been removed, or you may not have access to it.</p>
      <Link className="btn" to="/">
        Go to your home page
      </Link>
    </div>
  )
}

export function UnauthorisedState({ status }) {
  const { logout } = useAuth()
  const navigate = useNavigate()

  if (status === 401) {
    return (
      <div className="state state--error" role="alert">
        <h2>Your session has ended</h2>
        <p>Sign in again to continue.</p>
        <button
          type="button"
          className="btn"
          onClick={() => {
            logout()
            navigate('/login')
          }}
        >
          Sign in again
        </button>
      </div>
    )
  }
  return (
    <div className="state state--error" role="alert">
      <h2>You do not have access to this</h2>
      <p>Your account does not have permission to view this information.</p>
      <Link className="btn" to="/">
        Go to your home page
      </Link>
    </div>
  )
}
