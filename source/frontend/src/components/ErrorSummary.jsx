import { useEffect, useRef } from 'react'

// Moves focus to the list of problems each time the person tries to submit an invalid form.
export default function ErrorSummary({ errors, attempt, as: Heading = 'h2' }) {
  const ref = useRef(null)
  const entries = Object.entries(errors).filter(([, message]) => message)
  const count = entries.length

  useEffect(() => {
    if (attempt > 0 && count > 0) ref.current?.focus()
  }, [attempt, count])

  if (count === 0) return null

  return (
    <div ref={ref} tabIndex={-1} className="error-summary" aria-labelledby="error-summary-title">
      <Heading id="error-summary-title">There is a problem</Heading>
      <ul>
        {entries.map(([id, message]) => (
          <li key={id}>
            <a
              href={`#${id}`}
              onClick={(event) => {
                event.preventDefault()
                document.getElementById(id)?.focus()
              }}
            >
              {message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
