import { screen } from '@testing-library/react'
import { axe } from 'vitest-axe'
import { describe, expect, it } from 'vitest'
import { renderApp } from './test/renderApp'

describe('App shell (foundation smoke test)', () => {
  it('sends signed-out visitors to the sign-in page', async () => {
    renderApp({ route: '/' })
    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument()
  })

  it('has no automatically detectable accessibility violations', async () => {
    const { container } = renderApp({ route: '/login' })
    await screen.findByRole('heading', { level: 1, name: 'Sign in' })
    expect(await axe(container)).toHaveNoViolations()
  })
})
