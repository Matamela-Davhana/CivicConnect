import { useState } from 'react'
import { api } from '../../api'
import DataState from '../../components/DataState'
import ErrorSummary from '../../components/ErrorSummary'
import { Field } from '../../components/FormFields'
import Notice from '../../components/Notice'
import { EmptyState } from '../../components/StateMessages'
import { useAsync } from '../../hooks/useAsync'

function AddCategoryForm({ onCreated }) {
  const [name, setName] = useState('')
  const [errors, setErrors] = useState({})
  const [attempt, setAttempt] = useState(0)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState({ text: '', variant: 'success' })

  async function handleSubmit(event) {
    event.preventDefault()
    const next = name.trim() ? {} : { 'new-category-name': 'Enter a category name.' }
    setErrors(next)
    setAttempt((value) => value + 1)
    setMessage({ text: '', variant: 'success' })
    if (Object.keys(next).length > 0) return

    setBusy(true)
    try {
      await api.admin.categories.create({ name: name.trim() })
      setName('')
      setMessage({ text: 'Category added.', variant: 'success' })
      onCreated()
    } catch (error) {
      setMessage({ text: error.message, variant: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate aria-labelledby="add-category-heading" className="subsection">
      <h3 id="add-category-heading">Add a category</h3>
      <ErrorSummary errors={errors} attempt={attempt} as="h4" />
      <Notice message={message.text} variant={message.variant} />
      <Field
        id="new-category-name"
        label="Category name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        error={errors['new-category-name']}
        autoComplete="off"
        required
      />
      <button type="submit" className="btn" disabled={busy}>
        Add category
      </button>
    </form>
  )
}

export default function CategoriesPanel() {
  const categories = useAsync((signal) => api.admin.categories.list(signal), 'admin-categories')
  const [message, setMessage] = useState({ text: '', variant: 'success' })

  async function toggle(category) {
    try {
      await api.admin.categories.update(category.id, { active: !category.active })
      setMessage({ text: `${category.name} was ${category.active ? 'deactivated' : 'reactivated'}.`, variant: 'success' })
      categories.refresh()
    } catch (error) {
      setMessage({ text: error.message, variant: 'error' })
    }
  }

  return (
    <section aria-labelledby="categories-heading" className="card">
      <h2 id="categories-heading">Request categories</h2>
      <Notice message={message.text} variant={message.variant} />
      <DataState
        query={categories}
        loadingLabel="Loading categories"
        empty={
          <EmptyState title="There are no categories yet">
            <p>Residents cannot submit requests until at least one category exists.</p>
          </EmptyState>
        }
      >
        {(list) => (
          <div className="table-wrap" role="region" aria-label="Request categories" tabIndex={0}>
            <table>
              <caption className="visually-hidden">Request categories</caption>
              <thead>
                <tr>
                  <th scope="col">Category</th>
                  <th scope="col">Status</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {list.map((category) => (
                  <tr key={category.id}>
                    <th scope="row">{category.name}</th>
                    <td>{category.active ? 'Available to residents' : 'Deactivated'}</td>
                    <td>
                      <button type="button" className="btn btn--secondary btn--small" onClick={() => toggle(category)}>
                        {category.active ? 'Deactivate' : 'Reactivate'}{' '}
                        <span className="visually-hidden">{category.name}</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DataState>
      <AddCategoryForm onCreated={categories.refresh} />
    </section>
  )
}
