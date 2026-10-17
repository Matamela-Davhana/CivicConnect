import { useEffect, useRef } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { NAV_BY_ROLE, ROLE_LABELS } from '../constants'

export default function Layout() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const mainRef = useRef(null)
  const previousPath = useRef(location.pathname)

  // Move focus to <main> after in-app navigation so keyboard and screen-reader users land on the new page.
  useEffect(() => {
    if (previousPath.current !== location.pathname) {
      previousPath.current = location.pathname
      mainRef.current?.focus()
    }
  }, [location.pathname])

  function handleSignOut() {
    logout()
    navigate('/login')
  }

  const links = user ? (NAV_BY_ROLE[user.role] ?? []) : []

  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <header className="site-header">
        <div className="container site-header__inner">
          <Link to="/" className="brand">
            CivicConnect
          </Link>
          {user && (
            <>
              <nav aria-label="Main">
                <ul className="nav-list">
                  {links.map((link) => (
                    <li key={link.to}>
                      <NavLink to={link.to} end>
                        {link.label}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </nav>
              <div className="user-menu">
                <span>
                  {user.name} <span className="user-menu__role">({ROLE_LABELS[user.role]})</span>
                </span>
                <button type="button" className="btn btn--light btn--small" onClick={handleSignOut}>
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </header>
      <main id="main-content" ref={mainRef} tabIndex={-1} className="container main">
        <Outlet />
      </main>
      <footer className="site-footer">
        <div className="container">
          <p>CivicConnect helps residents report municipal service problems and follow their progress.</p>
        </div>
      </footer>
    </>
  )
}
