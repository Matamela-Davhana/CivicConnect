import { EmptyState, ErrorState, LoadingState, NotFoundState, UnauthorisedState } from './StateMessages'

const defaultIsEmpty = (data) => Array.isArray(data) && data.length === 0

/**
 * Renders the right state for a useAsync() query:
 * loading, unauthorised (401/403), not found (404), error with retry, empty, or the data.
 */
export default function DataState({ query, loadingLabel, isEmpty = defaultIsEmpty, empty, children }) {
  if (query.status === 'loading') return <LoadingState label={loadingLabel} />

  if (query.status === 'error') {
    const status = query.error?.status
    if (status === 401 || status === 403) return <UnauthorisedState status={status} />
    if (status === 404) return <NotFoundState />
    return <ErrorState error={query.error} onRetry={query.reload} />
  }

  if (isEmpty(query.data)) {
    return empty ?? <EmptyState title="Nothing to show yet" />
  }
  return children(query.data)
}
