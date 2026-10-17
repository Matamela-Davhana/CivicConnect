import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { people, renderApp } from './renderApp'

vi.mock('../api', () => ({
  api: { requests: { listMine: vi.fn(() => new Promise(() => {})) } },
}))

describe('layout and routing', () => {
  it('makes the skip link the first keyboard stop and targets <main>', async () => {
    const user = userEvent.setup()
    renderApp({ route: '/login' })
    await user.tab()
    const skip = screen.getByRole('link', { name: 'Skip to main content' })
    expect(skip).toHaveFocus()
    expect(skip).toHaveAttribute('href', '#main-content')
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content')
  })

  it('provides banner, navigation, main and footer landmarks when signed in', () => {
    renderApp({ route: '/requests', user: people.requester })
    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
    expect(screen.getByRole('contentinfo')).toBeInTheDocument()
  })

  it('redirects signed-out visitors from a protected page to sign in', async () => {
    renderApp({ route: '/requests' })
    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument()
  })

  it('shows a clear no-access page when the role does not match', async () => {
    renderApp({ route: '/staff', user: people.requester })
    expect(await screen.findByRole('heading', { level: 1, name: /do not have access/i })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Staff dashboard' })).not.toBeInTheDocument()
  })

  it('only offers navigation links for the signed-in role', () => {
    renderApp({ route: '/requests', user: people.requester })
    const nav = screen.getByRole('navigation', { name: 'Main' })
    expect(nav).toHaveTextContent('My requests')
    expect(nav).toHaveTextContent('Submit a request')
    expect(nav).not.toHaveTextContent('Staff dashboard')
  })

  it('shows a not-found page for unknown addresses', async () => {
    renderApp({ route: '/nothing-here' })
    expect(await screen.findByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument()
  })
})
