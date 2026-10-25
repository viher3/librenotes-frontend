import { useRef, useState, type FormEvent } from 'react'
import { Alert } from './Alert'
import { Button } from './Button'
import { Modal } from './Modal'
import { TextField } from './TextField'

interface PromptDialogProps {
  title: string
  label: string
  initialValue?: string
  submitLabel: string
  cancelLabel: string
  requiredMessage: string
  maxLength?: number
  /** Resolves when done (the dialog is closed by the caller) and rejects with a message-bearing error. */
  onSubmit: (value: string) => Promise<void>
  onCancel: () => void
  /** Turns a failure into text for the user. */
  describeError: (error: unknown) => string
}

/** Asks for one line of text (a name). The value is trimmed; an empty one is refused. */
export function PromptDialog({
  title,
  label,
  initialValue = '',
  submitLabel,
  cancelLabel,
  requiredMessage,
  maxLength = 255,
  onSubmit,
  onCancel,
  describeError,
}: PromptDialogProps) {
  const [value, setValue] = useState(initialValue)
  const [error, setError] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const name = value.trim()
    if (name === '') {
      setError(requiredMessage)
      return
    }
    setError(null)
    setFailure(null)
    setBusy(true)
    try {
      await onSubmit(name)
    } catch (cause) {
      setFailure(describeError(cause))
      setBusy(false)
    }
  }

  return (
    <Modal title={title} initialFocus={inputRef} busy={busy} onClose={onCancel}>
      <form onSubmit={submit} noValidate className="mt-3 flex flex-col gap-3">
        {failure && <Alert tone="error">{failure}</Alert>}
        <TextField
          ref={inputRef}
          label={label}
          value={value}
          maxLength={maxLength}
          error={error ?? undefined}
          onChange={(event) => setValue(event.target.value)}
          onFocus={(event) => event.currentTarget.select()}
        />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button type="submit" disabled={busy}>
            {submitLabel}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
