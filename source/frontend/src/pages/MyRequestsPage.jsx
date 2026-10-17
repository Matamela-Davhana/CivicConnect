import { Link } from 'react-router-dom'
import { api } from '../api'
import DataState from '../components/DataState'
import { EmptyState } from '../components/StateMessages'
import StatusBadge from '../components/StatusBadge'
import { useAsync } from '../hooks/useAsync'
import { usePageTitle } from '../hooks/usePageTitle'
import { formatDate } from '../lib/format'

export default function MyRequestsPage() {
  usePageTitle('My requests')
  const query = useAsync((signal) => api.requests.listMine(signal), 'my-requests')

  return (
    <>
      <div className="page-heading">
        <h1>My requests</h1>
        <Link className="btn" to="/requests/new">
          Submit a request
        </Link>
      </div>
      <DataState
        query={query}
        loadingLabel="Loading your requests"
        empty={
          <EmptyState title="You have not submitted any requests yet">
            <p>When you report a problem, it appears here with its reference number and current status.</p>
            <Link className="btn" to="/requests/new">
              Submit your first request
            </Link>
          </EmptyState>
        }
      >
        {(requests) => (
          <div className="table-wrap" role="region" aria-label="Your requests" tabIndex={0}>
            <table>
              <caption className="visually-hidden">Your requests, newest first</caption>
              <thead>
                <tr>
                  <th scope="col">Reference</th>
                  <th scope="col">Category</th>
                  <th scope="col">Status</th>
                  <th scope="col">Submitted</th>
                  <th scope="col">Last updated</th>
                </tr>
              </thead>
              <tbody>
                {[...requests]
                  .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
                  .map((request) => (
                    <tr key={request.id}>
                      <th scope="row">
                        <Link to={`/requests/${request.id}`}>{request.reference}</Link>
                      </th>
                      <td>{request.category}</td>
                      <td>
                        <StatusBadge status={request.status} />
                      </td>
                      <td>{formatDate(request.createdAt)}</td>
                      <td>{formatDate(request.updatedAt)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </DataState>
    </>
  )
}
