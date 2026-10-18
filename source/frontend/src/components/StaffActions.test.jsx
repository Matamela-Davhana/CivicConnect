import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api'
import { ApiError } from '../api/client'
import StaffActions from './StaffActions'

vi.mock('../api', () => ({ api: { requests: { act: vi.fn() }, staff: { assignees: vi.fn() } } }))
const request = { id: 'r1', status: 'submitted', rowVersion: 3, targetDate: null, assignee: null }

describe('StaffActions', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    api.staff.assignees.mockResolvedValue([{ id: 's1', name: 'Sam' }])
    api.requests.act.mockResolvedValue({ id: 'r1', status: 'accepted', rowVersion: 4 })
  })

  it('requires a target date to accept', async () => {
    const user = userEvent.setup()
    render(<StaffActions request={request} onChanged={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Accept request' }))
    expect(screen.getByLabelText(/Target completion date/)).toHaveFocus()
    expect(screen.getByText('Choose a target date.')).toBeInTheDocument()
    expect(api.requests.act).not.toHaveBeenCalled()
  })

  it('sends the displayed version and blocks a repeat save until refreshed data arrives', async () => {
    const user = userEvent.setup()
    const onChanged = vi.fn()
    const { rerender } = render(<StaffActions request={request} onChanged={onChanged} />)
    await user.type(screen.getByLabelText(/Target completion date/), '2026-11-01')
    await user.click(screen.getByRole('button', { name: 'Accept request' }))
    expect(api.requests.act).toHaveBeenCalledWith('r1', { action: 'accept', targetDate: '2026-11-01', rowVersion: 3 })
    expect(onChanged).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Accept request' })).toBeDisabled()
    rerender(<StaffActions request={{ ...request, status: 'accepted', rowVersion: 4, targetDate: '2026-11-01' }} onChanged={onChanged} />)
    expect(await screen.findByRole('button', { name: 'Save target date' })).toBeEnabled()
  })

  it('posts rejection with the public reason and version', async () => {
    const user = userEvent.setup()
    render(<StaffActions request={request} onChanged={vi.fn()} />)
    await user.type(screen.getByLabelText(/Reason for rejecting/), '  Outside service scope  ')
    await user.click(screen.getByRole('button', { name: 'Reject request' }))
    expect(api.requests.act).toHaveBeenCalledWith('r1', { action: 'reject', reason: 'Outside service scope', rowVersion: 3 })
  })

  it('requires a staff selection then sends assignment', async () => {
    const user = userEvent.setup()
    render(<StaffActions request={{ ...request, status: 'accepted', targetDate: '2026-11-01' }} onChanged={vi.fn()} />)
    await screen.findByRole('option', { name: 'Sam' })
    await user.click(screen.getByRole('button', { name: 'Save assignment' }))
    expect(api.requests.act).not.toHaveBeenCalled()
    expect(screen.getByLabelText(/Assign to/)).toHaveFocus()
    await user.selectOptions(screen.getByLabelText(/Assign to/), 's1')
    await user.click(screen.getByRole('button', { name: 'Save assignment' }))
    expect(api.requests.act).toHaveBeenCalledWith('r1', { action: 'assign', assigneeId: 's1', rowVersion: 3 })
  })

  it('saves a changed target date with version protection', async () => {
    const user = userEvent.setup()
    render(<StaffActions request={{ ...request, status: 'assigned', targetDate: '2026-11-01' }} onChanged={vi.fn()} />)
    await user.clear(screen.getByLabelText(/Target completion date/))
    await user.type(screen.getByLabelText(/Target completion date/), '2026-11-02')
    await user.click(screen.getByRole('button', { name: 'Save target date' }))
    expect(api.requests.act).toHaveBeenCalledWith('r1', { action: 'set_target', targetDate: '2026-11-02', rowVersion: 3 })
  })

  it('keeps draft text on a stale-version error and offers an explicit refresh', async () => {
    const user = userEvent.setup()
    const onChanged = vi.fn()
    api.requests.act.mockRejectedValue(new ApiError(409, 'This request has changed. Refresh it.'))
    render(<StaffActions request={{ ...request, status: 'in_progress' }} onChanged={onChanged} />)
    await user.type(screen.getByLabelText(/Update or comment/), 'Keep this draft')
    await user.selectOptions(screen.getByLabelText('Who can see this'), 'internal')
    await user.click(screen.getByRole('button', { name: 'Post update' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('This request has changed')
    expect(screen.getByLabelText(/Update or comment/)).toHaveValue('Keep this draft')
    expect(onChanged).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Refresh request' }))
    expect(onChanged).toHaveBeenCalledTimes(1)
  })

  it('posts internal progress with a public status change and clears only on success', async () => {
    const user = userEvent.setup()
    render(<StaffActions request={{ ...request, status: 'in_progress' }} onChanged={vi.fn()} />)
    await user.type(screen.getByLabelText(/Update or comment/), 'Repaired the light')
    await user.selectOptions(screen.getByLabelText('Who can see this'), 'internal')
    await user.selectOptions(screen.getByLabelText('Change status'), 'resolved')
    await user.click(screen.getByRole('button', { name: 'Post update' }))
    expect(api.requests.act).toHaveBeenCalledWith('r1', { action: 'update', message: 'Repaired the light', visibility: 'internal', status: 'resolved', rowVersion: 3 })
    await waitFor(() => expect(screen.getByLabelText(/Update or comment/)).toHaveValue(''))
  })

  for (const [status, expected] of [
    ['accepted', []], ['assigned', ['In progress']], ['in_progress', ['On hold', 'Resolved']],
    ['on_hold', ['In progress']], ['resolved', ['Closed']],
  ]) it(`offers only valid next states for ${status}`, () => {
    render(<StaffActions request={{ ...request, status }} onChanged={vi.fn()} />)
    expect([...screen.getByLabelText('Change status').options].map((o) => o.text))
      .toEqual(['Keep the current status', ...expected])
    if (status === 'resolved') expect(screen.queryByRole('button', { name: 'Save assignment' })).not.toBeInTheDocument()
  })

  for (const status of ['closed', 'rejected']) it(`does not offer actions for ${status}`, () => {
    render(<StaffActions request={{ ...request, status }} onChanged={vi.fn()} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByText(/No further actions/)).toBeInTheDocument()
  })
})
