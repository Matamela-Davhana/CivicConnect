import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'vitest-axe'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api'
import { ApiError } from '../api/client'
import { people, renderApp } from '../test/renderApp'

vi.mock('../api', () => ({
  api: {
    categories: { list: vi.fn() },
    requests: { create: vi.fn(), get: vi.fn(() => new Promise(() => {})) },
  },
}))

const categories = [
  { id: 'c1', name: 'Water' },
  { id: 'c2', name: 'Other' },
]

describe('SubmitRequestPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.categories.list.mockResolvedValue(categories)
  })

  it('has no accessibility violations', async () => {
    const { container } = renderApp({ route: '/requests/new', user: people.requester })
    await screen.findByLabelText(/category/i)
    expect(await axe(container)).toHaveNoViolations()
  })

  it('reports every missing field and moves focus to the summary', async () => {
    const user = userEvent.setup()
    renderApp({ route: '/requests/new', user: people.requester })
    await user.click(await screen.findByRole('button', { name: 'Submit request' }))
    expect(screen.getByText('There is a problem').closest('div')).toHaveFocus()
    expect(screen.getByRole('link', { name: 'Select a category.' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /at least 10 characters/i })).toBeInTheDocument()
    expect(api.requests.create).not.toHaveBeenCalled()
  })

  it('requires an explanation only when “Other” is chosen', async () => {
    const user = userEvent.setup()
    renderApp({ route: '/requests/new', user: people.requester })
    await user.selectOptions(await screen.findByLabelText(/category/i), 'Water')
    expect(screen.queryByLabelText(/explain what kind of problem/i)).not.toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText(/category/i), 'Other')
    expect(screen.getByLabelText(/explain what kind of problem/i)).toBeInTheDocument()

    await user.type(screen.getByLabelText(/describe the problem/i), 'A streetlight has been flickering for days.')
    await user.click(screen.getByRole('button', { name: 'Submit request' }))
    expect(screen.getByRole('link', { name: /explain what kind of problem this is/i })).toBeInTheDocument()
    expect(api.requests.create).not.toHaveBeenCalled()
  })

  it('submits the request and opens its detail page', async () => {
    api.requests.create.mockResolvedValue({ id: 'r9', reference: 'CC-0009' })
    const user = userEvent.setup()
    renderApp({ route: '/requests/new', user: people.requester })
    await user.selectOptions(await screen.findByLabelText(/category/i), 'Other')
    await user.type(screen.getByLabelText(/describe the problem/i), 'A streetlight has been flickering for days.')
    await user.type(screen.getByLabelText(/explain what kind of problem/i), 'Public lighting')
    await user.click(screen.getByRole('button', { name: 'Submit request' }))

    expect(api.requests.create).toHaveBeenCalledWith({
      categoryId: 'c2',
      description: 'A streetlight has been flickering for days.',
      otherExplanation: 'Public lighting',
    })
    expect(await screen.findByRole('heading', { level: 1, name: 'Request details' })).toBeInTheDocument()
    expect(screen.getByText(/CC-0009/)).toBeInTheDocument()
  })

  it('shows an empty state when no categories exist', async () => {
    api.categories.list.mockResolvedValue([])
    renderApp({ route: '/requests/new', user: people.requester })
    expect(await screen.findByRole('heading', { name: /no categories are available/i })).toBeInTheDocument()
  })

  it('submits a normal category without an Other explanation', async () => {
    api.requests.create.mockResolvedValue({ id: 'r10', reference: 'CC-0010' })
    const user = userEvent.setup()
    renderApp({ route: '/requests/new', user: people.requester })
    await user.selectOptions(await screen.findByLabelText(/category/i), 'Water')
    fireEvent.change(screen.getByLabelText(/describe the problem/i), { target: { value: '  A leaking pipe needs repair.  ' } })
    await user.click(screen.getByRole('button', { name: 'Submit request' }))
    expect(api.requests.create).toHaveBeenCalledWith({ categoryId: 'c1', description: 'A leaking pipe needs repair.' })
    expect(await screen.findByText(/CC-0010/)).toBeInTheDocument()
  })

  it('blocks an Other explanation longer than the backend limit', async () => {
    const user = userEvent.setup()
    renderApp({ route: '/requests/new', user: people.requester })
    await user.selectOptions(await screen.findByLabelText(/category/i), 'Other')
    fireEvent.change(screen.getByLabelText(/describe the problem/i), { target: { value: 'A service issue needs attention.' } })
    fireEvent.change(screen.getByLabelText(/explain what kind of problem/i), { target: { value: 'x'.repeat(1001) } })
    await user.click(screen.getByRole('button', { name: 'Submit request' }))
    expect(screen.getByRole('link', { name: 'Shorten the explanation to 1000 characters or fewer.' })).toBeInTheDocument()
    expect(api.requests.create).not.toHaveBeenCalled()
  })

  it('shows backend category validation with a working field link and re-enables submission', async () => {
    api.requests.create.mockRejectedValueOnce(new ApiError(422, 'Check the highlighted fields and try again.', { category: 'Select an available category.' }))
    const user = userEvent.setup()
    renderApp({ route: '/requests/new', user: people.requester })
    await user.selectOptions(await screen.findByLabelText(/category/i), 'Water')
    fireEvent.change(screen.getByLabelText(/describe the problem/i), { target: { value: 'A service issue needs attention.' } })
    await user.click(screen.getByRole('button', { name: 'Submit request' }))
    const link = await screen.findByRole('link', { name: 'Select an available category.' })
    await user.click(link)
    expect(screen.getByLabelText(/category/i)).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Submit request' })).toBeEnabled()
  })
})
