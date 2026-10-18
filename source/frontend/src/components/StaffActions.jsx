import { useRef, useState } from 'react'
import { api } from '../api'
import { useAsync } from '../hooks/useAsync'
import { STAFF_TRANSITIONS, STATUS_LABELS } from '../constants'
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
        disabled={busy}
        as="textarea"
        rows={3}
        maxLength={1000}
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
            disabled={busy}
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

function TargetDateForm({ request, busy, onSubmit, accepting = false }) {
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
    onSubmit({ action: accepting ? 'accept' : 'set_target', targetDate: date }, accepting ? 'Request accepted.' : 'Target date saved.')
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="action-form">
      <Field
        id="target-date"
        disabled={busy}
        type="date"
        ref={ref}
        label="Target completion date"
        value={date}
        onChange={(event) => setDate(event.target.value)}
        error={error}
        required
      />
      <button type="submit" className="btn" disabled={busy}>
        {accepting ? 'Accept request' : 'Save target date'}
      </button>
    </form>
  )
}

function UpdateForm({ request, busy, onSubmit }) {
  const [message, setMessage] = useState('')
  const [visibility, setVisibility] = useState('public')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const ref = useRef(null)

  async function handleSubmit(event) {
    event.preventDefault()
    if (!message.trim()) {
      setError('Write an update before posting.')
      ref.current?.focus()
      return
    }
    setError('')
    const saved = await onSubmit(
      { action: 'update', message: message.trim(), visibility, ...(status ? { status } : {}) },
      'Update posted.',
    )
    if (saved) {
      setMessage('')
      setStatus('')
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="action-form">
      <Field
        id="update-message"
        disabled={busy}
        as="textarea"
        rows={3}
        maxLength={1000}
        ref={ref}
        label="Update or comment"
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        error={error}
        required
      />
      <Field
        id="update-visibility"
        disabled={busy}
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
        disabled={busy}
        as="select"
        label="Change status"
        hint="Status changes are always visible to the requester, even when the comment is staff-only."
        value={status}
        onChange={(event) => setStatus(event.target.value)}
      >
        <option value="">Keep the current status</option>
        {(STAFF_TRANSITIONS[request.status] ?? []).map((value) => (
          <option key={value} value={value}>{STATUS_LABELS[value]}</option>
        ))}
      </Field>
      <button type="submit" className="btn" disabled={busy}>
        Post update
      </button>
    </form>
  )
}

export default function StaffActions({ request, onChanged }) {
  const [saving, setBusy] = useState(false)
  const [savedVersion, setSavedVersion] = useState(0)
  const inFlight = useRef(false)
  const [message, setMessage] = useState({ text: '', variant: 'success' })
  const busy = saving || !Number.isSafeInteger(request.rowVersion) || savedVersion > request.rowVersion

  async function perform(payload, successText) {
    if (inFlight.current || busy) return false
    inFlight.current = true
    setBusy(true)
    setMessage({ text: '', variant: 'success' })
    try {
      await api.requests.act(request.id, { ...payload, rowVersion: request.rowVersion })
      setSavedVersion(request.rowVersion + 1)
      setMessage({ text: successText, variant: 'success' })
      onChanged()
      return true
    } catch (error) {
      setMessage({ text: error.message, variant: 'error' })
      return false
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  const isNew = request.status === 'submitted'
  const isActive = ['accepted', 'assigned', 'in_progress', 'on_hold'].includes(request.status)
  const canUpdate = isActive || request.status === 'resolved'

  return (
    <section aria-labelledby="actions-heading" className="card">
      <h2 id="actions-heading">Staff actions</h2>
      <Notice message={message.text} variant={message.variant} />
      {message.variant === 'error' && (
        <button type="button" className="btn btn--secondary" onClick={onChanged} disabled={saving}>Refresh request</button>
      )}

      {isNew && (
        <>
          <h3>Review this request</h3>
          <TargetDateForm request={request} busy={busy} onSubmit={perform} accepting />
          <RejectForm busy={busy} onSubmit={perform} />
        </>
      )}

      {isActive && (
        <>
          <h3>Assignment and target date</h3>
          <AssignForm key={`assignee-${request.assignee?.id ?? 'none'}`} request={request} busy={busy} onSubmit={perform} />
          <TargetDateForm key={`target-${request.targetDate ?? 'none'}`} request={request} busy={busy} onSubmit={perform} />
        </>
      )}

      {canUpdate && <>
        <h3>Progress</h3>
        <UpdateForm request={request} busy={busy} onSubmit={perform} />
      </>}
      {!isNew && !canUpdate && <p>This request is closed. No further actions are available.</p>}
    </section>
  )
}
