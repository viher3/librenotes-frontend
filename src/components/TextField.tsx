import { useId, type ComponentProps } from 'react'

interface TextFieldProps extends ComponentProps<'input'> {
  label: string
  /** Already translated. */
  error?: string
  hint?: string
}

/** A labelled input wired for assistive technology: the error and hint are announced with the field. */
export function TextField({ label, error, hint, className = '', ...input }: TextFieldProps) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ')

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={`rounded-md border bg-transparent px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-500 ${
          error ? 'border-red-500' : 'border-neutral-300 dark:border-neutral-700'
        } ${className}`}
        {...input}
      />
      {hint && (
        <p id={hintId} className="text-xs text-neutral-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}

interface TextAreaFieldProps extends ComponentProps<'textarea'> {
  label: string
  /** Already translated. */
  error?: string
  hint?: string
}

/** A labelled multi-line field, wired like `TextField`. */
export function TextAreaField({
  label,
  error,
  hint,
  className = '',
  rows = 4,
  ...input
}: TextAreaFieldProps) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ')

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <textarea
        id={id}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={`rounded-md border bg-transparent px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-500 ${
          error ? 'border-red-500' : 'border-neutral-300 dark:border-neutral-700'
        } ${className}`}
        {...input}
      />
      {hint && (
        <p id={hintId} className="text-xs text-neutral-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}
