import { Link, useLocation, useParams } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth/useAuth'
import DataState from '../components/DataState'
import StaffActions from '../components/StaffActions'
import StatusBadge from '../components/StatusBadge'
import { ROLES } from '../constants'
import { useAsync } from '../hooks/useAsync'
import { usePageTitle } from '../hooks/usePageTitle'
import { formatDate, formatDateTime, isOverdue } from '../lib/format'

function Timeline({ entries, isStaff }) {
  // The server must already withhold internal entries from requesters; filtering again is defence in depth.
  const visible = entries
    .filter((entry) => isStaff || entry.visibility !== 'internal')
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))

  return (
    <section aria-labelledby="timeline-heading" className="card">
      <h2 id="timeline-heading">Status history and updates</h2>
      {visible.length === 0 ? (
        <p>There are no updates yet. You will see them here as staff work on this request.</p>
      ) : (
        <ol className="timeline">
          {visible.map((entry) => (
            <li key={entry.id} className={entry.visibility === 'internal' ? 'timeline__item timeline__item--internal' : 'timeline__item'}>
              <p className="timeline__meta">
                <time dateTime={entry.createdAt}>{formatDateTime(entry.createdAt)}</time>
                {entry.author && <span> · {entry.author}</span>}
                {entry.visibility === 'internal' && <span className="badge badge--internal">Internal comment</span>}
              </p>
              <p>{entry.message}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

function RequestView({ request, isStaff, onChanged }) {
  const overdue = isOverdue(request)
  return (
    <>
      <section aria-labelledby="summary-heading" className="card">
        <h2 id="summary-heading">Summary</h2>
        <dl className="details">
          <div>
            <dt>Status</dt>
            <dd>
              <StatusBadge status={request.status} />
            </dd>
          </div>
          <div>
            <dt>Category</dt>
            <dd>{request.category}</dd>
          </div>
          <div>
            <dt>Submitted</dt>
            <dd>{formatDate(request.createdAt)}</dd>
          </div>
          <div>
            <dt>Target date</dt>
            <dd>
              {formatDate(request.targetDate)}
              {overdue && <span className="badge badge--overdue">Overdue</span>}
            </dd>
          </div>
          {isStaff && (
            <>
              <div>
                <dt>Requester</dt>
                <dd>{request.requester?.name ?? '—'}</dd>
              </div>
              <div>
                <dt>Assigned to</dt>
                <dd>{request.assignee?.name ?? 'Not assigned'}</dd>
              </div>
            </>
          )}
        </dl>
        <h3>Description</h3>
        <p className="preserve-lines">{request.description}</p>
        {request.otherExplanation && (
          <>
            <h3>Explanation for “Other”</h3>
            <p className="preserve-lines">{request.otherExplanation}</p>
          </>
        )}
      </section>

      {isStaff && <StaffActions key={request.id} request={request} onChanged={onChanged} />}
      <Timeline entries={request.timeline ?? []} isStaff={isStaff} />
    </>
  )
}

export default function RequestDetailPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const location = useLocation()
  const isStaff = user.role === ROLES.STAFF
  const query = useAsync((signal) => api.requests.get(id, signal), `request-${id}`)

  const heading = query.data?.reference ? `Request ${query.data.reference}` : 'Request details'
  usePageTitle(heading)

  return (
    <>
      <p>
        <Link to={isStaff ? '/staff' : '/requests'}>
          <span aria-hidden="true">← </span>
          {isStaff ? 'Back to the staff dashboard' : 'Back to my requests'}
        </Link>
      </p>
      <h1>{heading}</h1>
      {location.state?.justSubmitted && (
        <p className="alert alert--success" role="status">
          Your request has been submitted. Keep reference number {location.state.reference} to track it.
        </p>
      )}
      <DataState query={query} loadingLabel="Loading request">
        {(request) => <RequestView request={request} isStaff={isStaff} onChanged={query.refresh} />}
      </DataState>
    </>
  )
}
