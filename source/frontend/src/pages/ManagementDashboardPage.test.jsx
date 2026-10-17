import { screen } from '@testing-library/react'
import { axe } from 'vitest-axe'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api'
import { people, renderApp } from '../test/renderApp'

vi.mock('../api', () => ({ api: { management: { summary: vi.fn() } } }))

describe('ManagementDashboardPage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows operational totals without requester details', async () => {
    api.management.summary.mockResolvedValue({
      open: 7,
      overdue: 2,
      completed: 11,
      byStatus: [
        { status: 'submitted', count: 3 },
        { status: 'in_progress', count: 4 },
        { status: 'completed', count: 11 },
      ],
      byCategory: [{ category: 'Water', count: 18 }],
    })
    const { container } = renderApp({ route: '/management', user: people.management })
    expect(await screen.findByText('Open requests')).toBeInTheDocument()
    expect(screen.getByText('Overdue requests').nextSibling).toHaveTextContent('2')
    expect(screen.queryByRole('columnheader', { name: /requester/i })).not.toBeInTheDocument()
    expect(await axe(container)).toHaveNoViolations()
  })

  it('shows an empty state before any request exists', async () => {
    api.management.summary.mockResolvedValue({ open: 0, overdue: 0, completed: 0, byStatus: [{ status: 'submitted', count: 0 }], byCategory: [] })
    renderApp({ route: '/management', user: people.management })
    expect(await screen.findByRole('heading', { name: /no requests to summarise/i })).toBeInTheDocument()
  })
})
