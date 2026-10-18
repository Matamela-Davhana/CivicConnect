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

  it('requires a sufficiently long initial password before creating a user', async () => {
    const user = userEvent.setup()
    renderApp({ route: '/admin', user: people.admin })
    await user.type(screen.getByLabelText(/Full name/), 'Local Test')
    await user.type(screen.getByLabelText(/Email address/), 'local@example.test')
    await user.click(screen.getByRole('button', { name: 'Add user' }))
    expect(screen.getByRole('link', { name: /initial password of at least 12/i })).toBeInTheDocument()
    expect(api.admin.users.create).not.toHaveBeenCalled()
  })

  it('submits a masked initial password and clears it after creation', async () => {
    api.admin.users.create.mockResolvedValue({ id: 'new' })
    const user = userEvent.setup()
    renderApp({ route: '/admin', user: people.admin })
    await user.type(screen.getByLabelText(/Full name/), 'Local Test')
    await user.type(screen.getByLabelText(/Email address/), 'local@example.test')
    const field = screen.getByLabelText(/Initial password/)
    expect(field).toHaveAttribute('type', 'password')
    await user.type(field, 'Disposable-local-123')
    await user.click(screen.getByRole('button', { name: 'Add user' }))
    expect(api.admin.users.create).toHaveBeenCalledWith({ name: 'Local Test', email: 'local@example.test', role: 'requester', password: 'Disposable-local-123' })
    expect(await screen.findByText('User account created.')).toBeInTheDocument()
    expect(field).toHaveValue('')
  })

  it('shows duplicate-account errors without clearing the form', async () => {
    api.admin.users.create.mockRejectedValue(new ApiError(409, 'That email already exists.'))
    const user = userEvent.setup()
    renderApp({ route: '/admin', user: people.admin })
    await user.type(screen.getByLabelText(/Full name/), 'Local Test')
    await user.type(screen.getByLabelText(/Email address/), 'local@example.test')
    await user.type(screen.getByLabelText(/Initial password/), 'Disposable-local-123')
    await user.click(screen.getByRole('button', { name: 'Add user' }))
    expect(await screen.findByText('That email already exists.')).toBeInTheDocument()
    expect(screen.getByLabelText(/Full name/)).toHaveValue('Local Test')
  })

  it('deactivates another user without changing their role', async () => {
    api.admin.users.update.mockResolvedValue(null)
    const user = userEvent.setup()
    renderApp({ route: '/admin', user: people.admin })
    await user.click(await screen.findByRole('button', { name: 'Deactivate Sipho Dlamini' }))
    expect(api.admin.users.update).toHaveBeenCalledWith('u2', { active: false })
    expect(await screen.findByText('Sipho Dlamini was deactivated.')).toBeInTheDocument()
  })

  it('creates a category and can deactivate an existing one', async () => {
    api.admin.categories.create.mockResolvedValue(null)
    api.admin.categories.update.mockResolvedValue(null)
    const user = userEvent.setup()
    renderApp({ route: '/admin', user: people.admin })
    await user.type(screen.getByLabelText(/Category name/), 'Local category')
    await user.click(screen.getByRole('button', { name: 'Add category' }))
    expect(api.admin.categories.create).toHaveBeenCalledWith({ name: 'Local category' })
    await user.click(await screen.findByRole('button', { name: 'Deactivate Water' }))
    expect(api.admin.categories.update).toHaveBeenCalledWith('c1', { active: false })
  })
})
