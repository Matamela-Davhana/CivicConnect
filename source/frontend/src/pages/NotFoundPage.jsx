import { Link } from 'react-router-dom'
import { usePageTitle } from '../hooks/usePageTitle'

export default function NotFoundPage() {
  usePageTitle('Page not found')
  return (
    <>
      <h1>Page not found</h1>
      <p>The address you followed does not match a page in CivicConnect.</p>
      <p>
        <Link className="btn" to="/">
          Go to your home page
        </Link>
      </p>
    </>
  )
}
