import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import DataState from '../components/DataState'
import ErrorSummary from '../components/ErrorSummary'
import { Field } from '../components/FormFields'
import { EmptyState } from '../components/StateMessages'
import { DESCRIPTION_MAX_LENGTH, DESCRIPTION_MIN_LENGTH, isOtherCategory } from '../constants'
import { useAsync } from '../hooks/useAsync'
import { usePageTitle } from '../hooks/usePageTitle'

function RequestForm({ categories }) {
  const navigate = useNavigate()
  const [categoryId, setCategoryId] = useState('')
  const [description, setDescription] = useState('')
  const [otherExplanation, setOtherExplanation] = useState('')
  const [errors, setErrors] = useState({})
  const [attempt, setAttempt] = useState(0)
  const [submitError, setSubmitError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const selected = categories.find((category) => String(category.id) === categoryId)
  const needsExplanation = isOtherCategory(selected)

  function validate() {
    const next = {}
    if (!selected) next.category = 'Select a category.'
    const text = description.trim()
    if (text.length < DESCRIPTION_MIN_LENGTH) {
      next.description = `Describe the problem in at least ${DESCRIPTION_MIN_LENGTH} characters.`
    } else if (text.length > DESCRIPTION_MAX_LENGTH) {
      next.description = `Shorten the description to ${DESCRIPTION_MAX_LENGTH} characters or fewer.`
    }
    if (needsExplanation && !otherExplanation.trim()) {
      next.otherExplanation = 'Explain what kind of problem this is, because you selected “Other”.'
    } else if (needsExplanation && otherExplanation.trim().length > DESCRIPTION_MAX_LENGTH) {
      next.otherExplanation = `Shorten the explanation to ${DESCRIPTION_MAX_LENGTH} characters or fewer.`
    }
    return next
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const next = validate()
    setErrors(next)
    setSubmitError('')
    setAttempt((value) => value + 1)
    if (Object.keys(next).length > 0) return

    setSubmitting(true)
    try {
      const created = await api.requests.create({
        categoryId: selected.id,
        description: description.trim(),
        ...(needsExplanation ? { otherExplanation: otherExplanation.trim() } : {}),
      })
      navigate(`/requests/${created.id}`, { state: { justSubmitted: true, reference: created.reference } })
    } catch (error) {
      if (error.details && typeof error.details === 'object') setErrors(error.details)
      setSubmitError(error.message)
      setAttempt((value) => value + 1)
      setSubmitting(false)
    }
  }

  return (
    <>
      <ErrorSummary errors={errors} attempt={attempt} />
      {submitError && (
        <p className="alert alert--error" role="alert">
          {submitError}
        </p>
      )}
      <form onSubmit={handleSubmit} noValidate aria-busy={submitting}>
        <Field
          id="category"
          as="select"
          label="Category"
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
          error={errors.category}
          required
        >
          <option value="">Select a category</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Field>

        <Field
          id="description"
          as="textarea"
          rows={6}
          label="Describe the problem"
          hint={`Say what is wrong, where it is and since when. ${description.length} of ${DESCRIPTION_MAX_LENGTH} characters used.`}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          error={errors.description}
          required
        />

        {needsExplanation && (
          <Field
            id="otherExplanation"
            as="textarea"
            rows={3}
            label="Explain what kind of problem this is"
            hint="Staff use this to route your request to the right team."
            value={otherExplanation}
            onChange={(event) => setOtherExplanation(event.target.value)}
            error={errors.otherExplanation}
            required
          />
        )}

        <button type="submit" className="btn" disabled={submitting}>
          {submitting ? 'Submitting…' : 'Submit request'}
        </button>
      </form>
    </>
  )
}

export default function SubmitRequestPage() {
  usePageTitle('Submit a request')
  const categories = useAsync((signal) => api.categories.list(signal), 'categories')

  return (
    <div className="narrow">
      <h1>Submit a request</h1>
      <p className="lead">Tell us about a municipal service problem. You will get a reference number to track it.</p>
      <DataState
        query={categories}
        loadingLabel="Loading categories"
        empty={
          <EmptyState title="No categories are available right now">
            <p>An administrator needs to add request categories before you can submit a request.</p>
          </EmptyState>
        }
      >
        {(list) => <RequestForm categories={list} />}
      </DataState>
    </div>
  )
}
