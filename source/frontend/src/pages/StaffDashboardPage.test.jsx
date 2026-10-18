import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'vitest-axe'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api'
import { people, renderApp } from '../test/renderApp'

vi.mock('../api', () => ({
  api: { staff: { queue: vi.fn() }, categories: { list: vi.fn() } },
}))

const queue = [
  { id: '1', reference: 'CC-0001', category: 'Water', status: 'submitted', requester: { name: 'Thandi' }, createdAt: '2026-10-01T08:00:00Z' },
  { id: '2', reference: 'CC-0002', category: 'Roads', status: 'accepted', requester: { name: 'Lerato' }, assignee: { name: 'Sipho' }, targetDate: '2020-01-01', createdAt: '2026-10-02T08:00:00Z' },
]

describe('StaffDashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.categories.list.mockResolvedValue([{ id: 'c1', name: 'Water' }])
    api.staff.queue.mockResolvedValue(queue)
  })

  it('lists the queue and flags overdue requests', async () => {
    renderApp({ route: '/staff', user: people.staff })
    expect(await screen.findByRole('link', { name: 'CC-0002' })).toBeInTheDocument()
    expect(screen.getByText('Overdue')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Showing 2 requests.')
  })

  it('applies filters through the API and the address', async () => {
    const user = userEvent.setup()
    renderApp({ route: '/staff', user: people.staff })
    await screen.findByRole('table')
    await user.selectOptions(screen.getByLabelText('Status'), 'Accepted')
    await user.click(screen.getByRole('button', { name: 'Apply filters' }))
    await screen.findByRole('table')
    expect(api.staff.queue).toHaveBeenLastCalledWith({ status: 'accepted', category: '', q: '' }, expect.anything())
  })

  it('offers to clear filters when nothing matches', async () => {
    api.staff.queue.mockResolvedValue([])
    renderApp({ route: '/staff?status=rejected', user: people.staff })
    expect(await screen.findByRole('heading', { name: /no requests match these filters/i })).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = renderApp({ route: '/staff', user: people.staff })
    await screen.findByRole('table')
    expect(await axe(container)).toHaveNoViolations()
  })
})
