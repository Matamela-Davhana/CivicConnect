import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'vitest-axe'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api'
import { ApiError } from '../api/client'
import { people, renderApp } from '../test/renderApp'

vi.mock('../api', () => ({
  api: {
    requests: { get: vi.fn(), act: vi.fn() },
    staff: { assignees: vi.fn() },
  },
}))

const request = {
  id: 'r1',
  reference: 'CC-0001',
  category: 'Water',
  status: 'submitted',
  rowVersion: 1,
  description: 'There is a burst pipe on my street.',
  createdAt: '2026-10-01T08:00:00Z',
  requester: { name: 'Thandi Mokoena' },
  timeline: [
    { id: 't1', visibility: 'public', author: 'System', message: 'Request submitted.', createdAt: '2026-10-01T08:00:00Z' },
    { id: 't2', visibility: 'internal', author: 'Sipho Dlamini', message: 'Possible duplicate of CC-0000.', createdAt: '2026-10-01T09:00:00Z' },
  ],
}

describe('RequestDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.requests.get.mockResolvedValue(request)
    api.staff.assignees.mockResolvedValue([{ id: 's1', name: 'Sipho Dlamini' }])
  })

  it('hides internal comments and staff actions from requesters', async () => {
    renderApp({ route: '/requests/r1', user: people.requester })
    expect(await screen.findByRole('heading', { level: 1, name: 'Request CC-0001' })).toBeInTheDocument()
    expect(screen.getByText('Request submitted.')).toBeInTheDocument()
    expect(screen.queryByText(/possible duplicate/i)).not.toBeInTheDocument()
    expect(screen.queryByText('Internal comment')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Staff actions' })).not.toBeInTheDocument()
  })

  it('shows internal comments and the review actions to staff', async () => {
    renderApp({ route: '/requests/r1', user: people.staff })
    expect(await screen.findByText(/possible duplicate/i)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Staff actions' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Accept request' })).toBeInTheDocument()
  })

  it('requires a reason before rejecting', async () => {
    const user = userEvent.setup()
    renderApp({ route: '/requests/r1', user: people.staff })
    await user.click(await screen.findByRole('button', { name: 'Reject request' }))
    expect(screen.getByText('Give a reason for rejecting this request.')).toBeInTheDocument()
    expect(api.requests.act).not.toHaveBeenCalled()
  })

  it('accepts a request and reloads it', async () => {
    api.requests.act.mockResolvedValue(null)
    const user = userEvent.setup()
    renderApp({ route: '/requests/r1', user: people.staff })
    await user.type(await screen.findByLabelText(/Target completion date/), '2026-11-01')
    await user.click(await screen.findByRole('button', { name: 'Accept request' }))
    expect(api.requests.act).toHaveBeenCalledWith('r1', { action: 'accept', targetDate: '2026-11-01', rowVersion: 1 })
    expect(await screen.findByText('Request accepted.')).toBeInTheDocument()
    expect(api.requests.get).toHaveBeenCalledTimes(2)
  })

  it('shows a not-found state when the request is not visible to the requester', async () => {
    api.requests.get.mockRejectedValue(new ApiError(404, 'Not found'))
    renderApp({ route: '/requests/other', user: people.requester })
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not find that/i)
  })

  it('has no accessibility violations for staff', async () => {
    const { container } = renderApp({ route: '/requests/r1', user: people.staff })
    await screen.findByRole('heading', { name: 'Staff actions' })
    expect(await axe(container)).toHaveNoViolations()
  })
})
