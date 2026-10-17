import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'vitest-axe'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api'
import { ApiError } from '../api/client'
import { people, renderApp } from '../test/renderApp'

vi.mock('../api', () => ({ api: { requests: { listMine: vi.fn() } } }))

const rows = [
  { id: '1', reference: 'CC-0001', category: 'Water', status: 'submitted', createdAt: '2026-10-01T08:00:00Z', updatedAt: '2026-10-01T08:00:00Z' },
  { id: '2', reference: 'CC-0002', category: 'Roads', status: 'in_progress', createdAt: '2026-10-05T08:00:00Z', updatedAt: '2026-10-06T08:00:00Z' },
]

describe('MyRequestsPage states', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows loading, then the requester’s requests with reference numbers and statuses', async () => {
    api.requests.listMine.mockResolvedValue(rows)
    renderApp({ route: '/requests', user: people.requester })
    expect(screen.getByRole('status')).toHaveTextContent(/loading your requests/i)
    expect(await screen.findByRole('link', { name: 'CC-0001' })).toHaveAttribute('href', '/requests/1')
    expect(screen.getByText('In progress')).toBeInTheDocument()
    expect(screen.getByText('Submitted')).toBeInTheDocument()
  })

  it('has no accessibility violations once loaded', async () => {
    api.requests.listMine.mockResolvedValue(rows)
    const { container } = renderApp({ route: '/requests', user: people.requester })
    await screen.findByRole('table')
    expect(await axe(container)).toHaveNoViolations()
  })

  it('shows an empty state that invites the first request', async () => {
    api.requests.listMine.mockResolvedValue([])
    renderApp({ route: '/requests', user: people.requester })
    expect(await screen.findByRole('heading', { name: /have not submitted any requests/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Submit your first request' })).toBeInTheDocument()
  })

  it('shows an error with a working retry', async () => {
    api.requests.listMine.mockRejectedValueOnce(new ApiError(500, 'The server ran into a problem.')).mockResolvedValueOnce(rows)
    const user = userEvent.setup()
    renderApp({ route: '/requests', user: people.requester })
    expect(await screen.findByRole('alert')).toHaveTextContent('The server ran into a problem.')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('table')).toBeInTheDocument()
  })

  it('shows an unauthorised state when the API answers 403', async () => {
    api.requests.listMine.mockRejectedValue(new ApiError(403, 'Forbidden'))
    renderApp({ route: '/requests', user: people.requester })
    expect(await screen.findByRole('alert')).toHaveTextContent(/do not have access/i)
  })

  it('asks the person to sign in again when the API answers 401', async () => {
    api.requests.listMine.mockRejectedValue(new ApiError(401, 'Expired'))
    renderApp({ route: '/requests', user: people.requester })
    expect(await screen.findByRole('button', { name: 'Sign in again' })).toBeInTheDocument()
  })
})
