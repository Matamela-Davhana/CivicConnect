import { api } from '../api'
import DataState from '../components/DataState'
import { EmptyState } from '../components/StateMessages'
import { STATUS_LABELS } from '../constants'
import { useAsync } from '../hooks/useAsync'
import { usePageTitle } from '../hooks/usePageTitle'

function BreakdownTable({ caption, label, rows, total }) {
  return (
    <div className="table-wrap" role="region" aria-label={caption} tabIndex={0}>
      <table>
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">{label}</th>
            <th scope="col">Requests</th>
            <th scope="col">Share</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const percent = total > 0 ? Math.round((row.count / total) * 100) : 0
            return (
              <tr key={row.name}>
                <th scope="row">{row.name}</th>
                <td>{row.count}</td>
                <td>
                  <span className="bar" aria-hidden="true">
                    <span style={{ width: `${percent}%` }} />
                  </span>
                  {percent}%
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function ManagementDashboardPage() {
  usePageTitle('Management dashboard')
  const query = useAsync((signal) => api.management.summary(signal), 'management-summary')

  return (
    <>
      <h1>Management dashboard</h1>
      <p className="lead">Operational summary of service requests. It shows no requester details or internal comments.</p>
      <DataState
        query={query}
        loadingLabel="Loading the summary"
        isEmpty={(data) => (data.byStatus ?? []).every((row) => row.count === 0)}
        empty={
          <EmptyState title="There are no requests to summarise yet">
            <p>Figures appear here once residents start submitting requests.</p>
          </EmptyState>
        }
      >
        {(summary) => {
          const total = summary.byStatus.reduce((sum, row) => sum + row.count, 0)
          const statusRows = summary.byStatus.map((row) => ({ name: STATUS_LABELS[row.status] ?? row.status, count: row.count }))
          const categoryRows = (summary.byCategory ?? []).map((row) => ({ name: row.category, count: row.count }))
          return (
            <>
              <section aria-labelledby="totals-heading">
                <h2 id="totals-heading">Overview</h2>
                <dl className="stat-grid">
                  <div className="stat">
                    <dt>Open requests</dt>
                    <dd>{summary.open}</dd>
                  </div>
                  <div className="stat stat--alert">
                    <dt>Overdue requests</dt>
                    <dd>{summary.overdue}</dd>
                  </div>
                  <div className="stat">
                    <dt>Completed requests</dt>
                    <dd>{summary.completed}</dd>
                  </div>
                </dl>
              </section>
              <section aria-labelledby="status-heading" className="card">
                <h2 id="status-heading">Requests by status</h2>
                <BreakdownTable caption="Requests by status" label="Status" rows={statusRows} total={total} />
              </section>
              {categoryRows.length > 0 && (
                <section aria-labelledby="category-heading" className="card">
                  <h2 id="category-heading">Requests by category</h2>
                  <BreakdownTable caption="Requests by category" label="Category" rows={categoryRows} total={total} />
                </section>
              )}
            </>
          )
        }}
      </DataState>
    </>
  )
}
