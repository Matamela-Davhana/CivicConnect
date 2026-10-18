import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api'
import { ApiError } from '../api/client'
import { people, renderApp } from '../test/renderApp'

vi.mock('../api', () => ({
  api: {
    auth: { login: vi.fn() },
    requests: { listMine: vi.fn(() => new Promise(() => {})) },
  },
}))

describe('LoginPage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lists the problems when the form is submitted empty', async () => {
    const user = userEvent.setup()
    renderApp({ route: '/login' })
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    const summary = screen.getByText('There is a problem').closest('div')
    expect(summary).toHaveFocus()
    expect(screen.getByRole('link', { name: 'Enter your email address.' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Enter your password.' })).toBeInTheDocument()
    expect(api.auth.login).not.toHaveBeenCalled()
  })

  it('shows a plain message for wrong credentials', async () => {
    api.auth.login.mockRejectedValue(new ApiError(401, 'Invalid'))
    const user = userEvent.setup()
    renderApp({ route: '/login' })
    await user.type(screen.getByLabelText(/email address/i), 'thandi@example.com')
    await user.type(screen.getByLabelText(/password/i), 'wrong')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('The email address or password is incorrect.')
  })

  it('sends a requester to My requests after signing in', async () => {
    api.auth.login.mockResolvedValue({ token: 't', user: people.requester })
    const user = userEvent.setup()
    renderApp({ route: '/login' })
    await user.type(screen.getByLabelText(/email address/i), 'thandi@example.com')
    await user.type(screen.getByLabelText(/password/i), 'correct horse')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'My requests' })).toBeInTheDocument()
    expect(api.auth.login).toHaveBeenCalledWith({ email: 'thandi@example.com', password: 'correct horse' })
  })
})
