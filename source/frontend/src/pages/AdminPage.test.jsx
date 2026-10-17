import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'vitest-axe'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api'
import { ApiError } from '../api/client'
import { people, renderApp } from '../test/renderApp'

vi.mock('../api', () => ({
  api: {
    admin: {
      users: { list: vi.fn(), create: vi.fn(), update: vi.fn() },
      categories: { list: vi.fn(), create: vi.fn(), update: vi.fn() },
    },
  },
}))

const users = [
  { id: 'u-admin', name: 'Naledi Khumalo', email: 'naledi@example.com', role: 'admin', active: true },
  { id: 'u2', name: 'Sipho Dlamini', email: 'sipho@example.com', role: 'staff', active: true },
]

describe('AdminPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.admin.users.list.mockResolvedValue(users)
    api.admin.categories.list.mockResolvedValue([{ id: 'c1', name: 'Water', active: true }])
  })

  it('has no accessibility violations', async () => {
    const { container } = renderApp({ route: '/admin', user: people.admin })
    await screen.findByRole('rowheader', { name: 'Sipho Dlamini' })
    await screen.findByText('Available to residents')
    expect(await axe(container)).toHaveNoViolations()
  })

  it('stops administrators changing their own role or status', async () => {
    renderApp({ route: '/admin', user: people.admin })
    await screen.findByRole('rowheader', { name: 'Sipho Dlamini' })
    expect(screen.getByLabelText('Role for Naledi Khumalo')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Deactivate Naledi Khumalo' })).toBeDisabled()
  })

  it('saves a changed role', async () => {
    api.admin.users.update.mockResolvedValue(null)
    const user = userEvent.setup()
    renderApp({ route: '/admin', user: people.admin })
    await user.selectOptions(await screen.findByLabelText('Role for Sipho Dlamini'), 'Management')
    await user.click(screen.getByRole('button', { name: 'Save role for Sipho Dlamini' }))
    expect(api.admin.users.update).toHaveBeenCalledWith('u2', { role: 'management' })
    expect(await screen.findByText('Role updated for Sipho Dlamini.')).toBeInTheDocument()
  })

  it('shows errors from the user list with a retry', async () => {
    api.admin.users.list.mockRejectedValue(new ApiError(500, 'Could not load users.'))
    renderApp({ route: '/admin', user: people.admin })
    const alert = await screen.findByText('Could not load users.')
    expect(within(alert.closest('[role="alert"]')).getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('validates the new category name', async () => {
    const user = userEvent.setup()
    renderApp({ route: '/admin', user: people.admin })
    await user.click(await screen.findByRole('button', { name: 'Add category' }))
    expect(screen.getByRole('link', { name: 'Enter a category name.' })).toBeInTheDocument()
    expect(api.admin.categories.create).not.toHaveBeenCalled()
  })
})
