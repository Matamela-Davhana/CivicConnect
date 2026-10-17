import { useRef, useState } from 'react'
import { api } from '../api'
import { useAsync } from '../hooks/useAsync'
import DataState from './DataState'
import { Field } from './FormFields'
import Notice from './Notice'
import { EmptyState } from './StateMessages'

function RejectForm({ busy, onSubmit }) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const ref = useRef(null)

  function handleSubmit(event) {
    event.preventDefault()
    if (!reason.trim()) {
      setError('Give a reason for rejecting this request.')
      ref.current?.focus()
      return
    }
    setError('')
    onSubmit({ action: 'reject', reason: reason.trim() }, 'Request rejected.')
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="action-form">
      <Field
        id="reject-reason"
        as="textarea"
        rows={3}
        ref={ref}
        label="Reason for rejecting"
        hint="The requester will see this reason."
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        error={error}
        required
      />
      <button type="submit" className="btn btn--danger" disabled={busy}>
        Reject request
      </button>
    </form>
  )
}

function AssignForm({ request, busy, onSubmit }) {
  const assignees = useAsync((signal) => api.staff.assignees(signal), 'assignees')
  const [assigneeId, setAssigneeId] = useState(request.assignee?.id ? String(request.assignee.id) : '')
  const [error, setError] = useState('')
  const ref = useRef(null)

  function handleSubmit(event) {
    event.preventDefault()
    if (!assigneeId) {
      setError('Select a staff member.')
      ref.current?.focus()
      return
    }
    setError('')
    onSubmit({ action: 'assign', assigneeId }, 'Staff member assigned.')
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="action-form">
      <DataState
        query={assignees}
        loadingLabel="Loading staff"
        empty={<EmptyState title="No staff members available" />}
      >
        {(list) => (
          <Field
            id="assignee"
            as="select"
            ref={ref}
            label="Assign to"
            value={assigneeId}
            onChange={(event) => setAssigneeId(event.target.value)}
            error={error}
            required
          >
            <option value="">Select a staff member</option>
            {list.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </Field>
        )}
      </DataState>
      <button type="submit" className="btn" disabled={busy || assignees.status !== 'success'}>
        Save assignment
      </button>
    </form>
  )
}

function TargetDateForm({ request, busy, onSubmit }) {
  const [date, setDate] = useState(request.targetDate ? String(request.targetDate).slice(0, 10) : '')
  const [error, setError] = useState('')
  const ref = useRef(null)

  function handleSubmit(event) {
    event.preventDefault()
    if (!date) {
      setError('Choose a target date.')
      ref.current?.focus()
      return
    }
    setError('')
    onSubmit({ action: 'set_target', targetDate: date }, 'Target date saved.')
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="action-form">
      <Field
        id="target-date"
        type="date"
        ref={ref}
        label="Target completion date"
        value={date}
        onChange={(event) => setDate(event.target.value)}
        error={error}
        required
      />
      <button type="submit" className="btn" disabled={busy}>
        Save target date
      </button>
    </form>
  )
}

function UpdateForm({ busy, onSubmit }) {
  const [message, setMessage] = useState('')
  const [visibility, setVisibility] = useState('public')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const ref = useRef(null)

  function handleSubmit(event) {
    event.preventDefault()
    if (!message.trim()) {
      setError('Write an update before posting.')
      ref.current?.focus()
      return
    }
    setError('')
    onSubmit(
      { action: 'update', message: message.trim(), visibility, ...(status ? { status } : {}) },
      'Update posted.',
    )
    setMessage('')
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="action-form">
      <Field
        id="update-message"
        as="textarea"
        rows={3}
        ref={ref}
        label="Update or comment"
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        error={error}
        required
      />
      <Field
        id="update-visibility"
        as="select"
        label="Who can see this"
        value={visibility}
        onChange={(event) => setVisibility(event.target.value)}
      >
        <option value="public">Requester and staff</option>
        <option value="internal">Staff only (internal comment)</option>
      </Field>
      <Field
        id="update-status"
        as="select"
        label="Change status"
        value={status}
        onChange={(event) => setStatus(event.target.value)}
      >
        <option value="">Keep the current status</option>
        <option value="in_progress">In progress</option>
        <option value="completed">Completed</option>
      </Field>
      <button type="submit" className="btn" disabled={busy}>
        Post update
      </button>
    </form>
  )
}

export default function StaffActions({ request, onChanged }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState({ text: '', variant: 'success' })

  async function perform(payload, successText) {
    setBusy(true)
    setMessage({ text: '', variant: 'success' })
    try {
      await api.requests.act(request.id, payload)
      setMessage({ text: successText, variant: 'success' })
      onChanged()
    } catch (error) {
      setMessage({ text: error.message, variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const isNew = request.status === 'submitted'
  const isActive = request.status === 'accepted' || request.status === 'in_progress'

  return (
    <section aria-labelledby="actions-heading" className="card">
      <h2 id="actions-heading">Staff actions</h2>
      <Notice message={message.text} variant={message.variant} />

      {isNew && (
        <>
          <h3>Review this request</h3>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => perform({ action: 'accept' }, 'Request accepted.')}
          >
            Accept request
          </button>
          <RejectForm busy={busy} onSubmit={perform} />
        </>
      )}

      {isActive && (
        <>
          <h3>Assignment and target date</h3>
          <AssignForm key={request.assignee?.id ?? 'none'} request={request} busy={busy} onSubmit={perform} />
          <TargetDateForm key={request.targetDate ?? 'none'} request={request} busy={busy} onSubmit={perform} />
          <h3>Progress</h3>
          <UpdateForm busy={busy} onSubmit={perform} />
        </>
      )}

      {!isNew && !isActive && <p>This request is closed. No further actions are available.</p>}
    </section>
  )
}
