import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import DataState from '../components/DataState'
import { Field } from '../components/FormFields'
import { EmptyState } from '../components/StateMessages'
import StatusBadge from '../components/StatusBadge'
import { STATUS_LABELS } from '../constants'
import { useAsync } from '../hooks/useAsync'
import { usePageTitle } from '../hooks/usePageTitle'
import { formatDate, isOverdue } from '../lib/format'

export default function StaffDashboardPage() {
  usePageTitle('Staff dashboard')
  const [params, setParams] = useSearchParams()
  const filters = {
    status: params.get('status') ?? '',
    category: params.get('category') ?? '',
    q: params.get('q') ?? '',
  }
  const key = params.toString()
  const hasFilters = Boolean(filters.status || filters.category || filters.q)

  const queue = useAsync((signal) => api.staff.queue(filters, signal), `queue-${key}`)
  const categories = useAsync((signal) => api.categories.list(signal), 'categories')

  function applyFilters(event) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const next = new URLSearchParams()
    for (const name of ['status', 'category', 'q']) {
      const value = String(data.get(name) ?? '').trim()
      if (value) next.set(name, value)
    }
    setParams(next)
  }

  const clearFilters = () => setParams(new URLSearchParams())

  return (
    <>
      <h1>Staff dashboard</h1>
      <p className="lead">Review new requests, assign work and keep progress up to date.</p>

      <section aria-labelledby="filters-heading" className="card">
        <h2 id="filters-heading">Filter the queue</h2>
        <form key={key} onSubmit={applyFilters} className="filter-form">
          <Field id="status" as="select" label="Status" defaultValue={filters.status}>
            <option value="">All statuses</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Field>
          <Field
            id="category"
            as="select"
            label="Category"
            defaultValue={filters.category}
            hint={categories.status === 'error' ? 'Categories could not be loaded.' : undefined}
          >
            <option value="">All categories</option>
            {(categories.data ?? []).map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Field>
          <Field id="q" type="search" label="Reference number" defaultValue={filters.q} />
          <div className="filter-form__actions">
            <button type="submit" className="btn">
              Apply filters
            </button>
            {hasFilters && (
              <button type="button" className="btn btn--secondary" onClick={clearFilters}>
                Clear filters
              </button>
            )}
          </div>
        </form>
      </section>

      <DataState
        query={queue}
        loadingLabel="Loading the request queue"
        empty={
          hasFilters ? (
            <EmptyState title="No requests match these filters">
              <p>Try a different status, category or reference number.</p>
              <button type="button" className="btn" onClick={clearFilters}>
                Clear filters
              </button>
            </EmptyState>
          ) : (
            <EmptyState title="The queue is empty">
              <p>New requests from residents will appear here.</p>
            </EmptyState>
          )
        }
      >
        {(requests) => (
          <>
            <p role="status">
              Showing {requests.length} {requests.length === 1 ? 'request' : 'requests'}.
            </p>
            <div className="table-wrap" role="region" aria-label="Request queue" tabIndex={0}>
              <table>
                <caption className="visually-hidden">Request queue</caption>
                <thead>
                  <tr>
                    <th scope="col">Reference</th>
                    <th scope="col">Category</th>
                    <th scope="col">Requester</th>
                    <th scope="col">Status</th>
                    <th scope="col">Assigned to</th>
                    <th scope="col">Target date</th>
                    <th scope="col">Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((request) => (
                    <tr key={request.id}>
                      <th scope="row">
                        <Link to={`/requests/${request.id}`}>{request.reference}</Link>
                      </th>
                      <td>{request.category}</td>
                      <td>{request.requester?.name ?? '—'}</td>
                      <td>
                        <StatusBadge status={request.status} />
                      </td>
                      <td>{request.assignee?.name ?? 'Not assigned'}</td>
                      <td>
                        {formatDate(request.targetDate)}
                        {isOverdue(request) && <span className="badge badge--overdue">Overdue</span>}
                      </td>
                      <td>{formatDate(request.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </DataState>
    </>
  )
}
