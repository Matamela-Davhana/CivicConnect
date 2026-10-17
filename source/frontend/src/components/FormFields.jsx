export function Field({ id, label, hint, error, required, as: Control = 'input', children, ...props }) {
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined

  return (
    <div className={error ? 'field field--error' : 'field'}>
      <label htmlFor={id}>
        {label}
        {required && <span className="field__required"> (required)</span>}
      </label>
      {hint && (
        <p id={hintId} className="field__hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="field__error">
          <span className="visually-hidden">Error: </span>
          {error}
        </p>
      )}
      <Control
        id={id}
        name={id}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy}
        aria-required={required || undefined}
        {...props}
      >
        {children}
      </Control>
    </div>
  )
}
