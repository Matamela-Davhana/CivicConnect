import { useState } from 'react'
import { api } from '../../api'
import DataState from '../../components/DataState'
import ErrorSummary from '../../components/ErrorSummary'
import { Field } from '../../components/FormFields'
import Notice from '../../components/Notice'
import { EmptyState } from '../../components/StateMessages'
import { ROLE_LABELS } from '../../constants'
import { useAsync } from '../../hooks/useAsync'

const roleOptions = Object.entries(ROLE_LABELS)

function UserRow({ user, isSelf, onSave }) {
  const [role, setRole] = useState(user.role)
  return (
    <tr>
      <th scope="row">
        {user.name}
        {isSelf && <span className="muted"> (you)</span>}
      </th>
      <td>{user.email}</td>
      <td>
        <label className="visually-hidden" htmlFor={`role-${user.id}`}>
          Role for {user.name}
        </label>
        <select id={`role-${user.id}`} value={role} onChange={(event) => setRole(event.target.value)} disabled={isSelf}>
          {roleOptions.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </td>
      <td>{user.active ? 'Active' : 'Deactivated'}</td>
      <td>
        <div className="row-actions">
          <button
            type="button"
            className="btn btn--small"
            disabled={isSelf || role === user.role}
            onClick={() => onSave(user.id, { role }, `Role updated for ${user.name}.`)}
          >
            Save role{' '}
            <span className="visually-hidden">for {user.name}</span>
          </button>
          <button
            type="button"
            className="btn btn--secondary btn--small"
            disabled={isSelf}
            onClick={() =>
              onSave(user.id, { active: !user.active }, `${user.name} was ${user.active ? 'deactivated' : 'reactivated'}.`)
            }
          >
            {user.active ? 'Deactivate' : 'Reactivate'}{' '}
            <span className="visually-hidden">{user.name}</span>
          </button>
        </div>
      </td>
    </tr>
  )
}

function AddUserForm({ onCreated }) {
  const [values, setValues] = useState({ name: '', email: '', role: 'requester' })
  const [errors, setErrors] = useState({})
  const [attempt, setAttempt] = useState(0)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState({ text: '', variant: 'success' })

  const set = (field) => (event) => setValues((current) => ({ ...current, [field]: event.target.value }))

  async function handleSubmit(event) {
    event.preventDefault()
    const next = {}
    if (!values.name.trim()) next['new-user-name'] = 'Enter the person’s full name.'
    if (!values.email.trim()) next['new-user-email'] = 'Enter an email address.'
    else if (!/^\S+@\S+\.\S+$/.test(values.email.trim())) next['new-user-email'] = 'Enter an email address in the format name@example.com.'
    setErrors(next)
    setAttempt((value) => value + 1)
    setMessage({ text: '', variant: 'success' })
    if (Object.keys(next).length > 0) return

    setBusy(true)
    try {
      await api.admin.users.create({ name: values.name.trim(), email: values.email.trim(), role: values.role })
      setValues({ name: '', email: '', role: 'requester' })
      setMessage({ text: 'User account created.', variant: 'success' })
      onCreated()
    } catch (error) {
      setMessage({ text: error.message, variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate aria-labelledby="add-user-heading" className="subsection">
      <h3 id="add-user-heading">Add a user</h3>
      <ErrorSummary errors={errors} attempt={attempt} as="h4" />
      <Notice message={message.text} variant={message.variant} />
      <Field id="new-user-name" label="Full name" value={values.name} onChange={set('name')} error={errors['new-user-name']} autoComplete="off" required />
      <Field id="new-user-email" type="email" label="Email address" value={values.email} onChange={set('email')} error={errors['new-user-email']} autoComplete="off" required />
      <Field id="new-user-role" as="select" label="Role" value={values.role} onChange={set('role')}>
        {roleOptions.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </Field>
      <button type="submit" className="btn" disabled={busy}>
        Add user
      </button>
    </form>
  )
}

export default function UsersPanel({ currentUserId }) {
  const [message, setMessage] = useState({ text: '', variant: 'success' })
  const users = useAsync((signal) => api.admin.users.list(signal), 'admin-users')

  async function save(id, patch, successText) {
    try {
      await api.admin.users.update(id, patch)
      setMessage({ text: successText, variant: 'success' })
      users.refresh()
    } catch (error) {
      setMessage({ text: error.message, variant: 'error' })
    }
  }

  return (
    <section aria-labelledby="users-heading" className="card">
      <h2 id="users-heading">User accounts</h2>
      <Notice message={message.text} variant={message.variant} />
      <DataState
        query={users}
        loadingLabel="Loading user accounts"
        empty={
          <EmptyState title="There are no user accounts yet">
            <p>Add the first account using the form below.</p>
          </EmptyState>
        }
      >
        {(list) => (
          <div className="table-wrap" role="region" aria-label="User accounts table" tabIndex={0}>
            <table>
              <caption className="visually-hidden">User accounts</caption>
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Email</th>
                  <th scope="col">Role</th>
                  <th scope="col">Status</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {list.map((person) => (
                  <UserRow key={`${person.id}-${person.role}`} user={person} isSelf={person.id === currentUserId} onSave={save} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DataState>
      <AddUserForm onCreated={users.refresh} />
    </section>
  )
}
