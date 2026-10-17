import { Link } from 'react-router-dom'
import { usePageTitle } from '../hooks/usePageTitle'

export default function UnauthorisedPage() {
  usePageTitle('No access')
  return (
    <>
      <h1>You do not have access to this page</h1>
      <p>Your account role does not include this part of CivicConnect.</p>
      <p>
        <Link className="btn" to="/">
          Go to your home page
        </Link>
      </p>
    </>
  )
}
