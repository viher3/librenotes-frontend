import { useRef, type ReactNode } from 'react'
import { Button } from './Button'
import { Modal } from './Modal'

interface ConfirmDialogProps {
  title: string
  children: ReactNode
  confirmLabel: string
  cancelLabel: string
  busy?: boolean
  /** Style the confirm button as dangerous. */
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/** Asks before doing something. Focus starts on the safe option (cancel). */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  cancelLabel,
  busy = false,
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  return (
    <Modal title={title} role="alertdialog" initialFocus={cancelRef} busy={busy} onClose={onCancel}>
      <div className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">{children}</div>
      <div className="mt-5 flex justify-end gap-2">
        <Button ref={cancelRef} variant="secondary" onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </Button>
        <Button variant={destructive ? 'danger' : 'primary'} onClick={onConfirm} disabled={busy}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  )
}
