import { render, screen } from '@testing-library/react'
import { axe } from 'vitest-axe'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App shell (foundation smoke test)', () => {
  it('renders the CivicConnect heading', () => {
    render(<App />)
    expect(
      screen.getByRole('heading', { name: 'CivicConnect' }),
    ).toBeInTheDocument()
  })

  it('has no automatically detectable accessibility violations', async () => {
    const { container } = render(<App />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
