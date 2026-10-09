import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react'

interface ModalProps {
  title: string
  children: ReactNode
  /** `alertdialog` for confirmations of something destructive; `dialog` otherwise. */
  role?: 'dialog' | 'alertdialog'
  /** Element that receives focus when the modal opens (defaults to the first focusable one). */
  initialFocus?: RefObject<HTMLElement | null>
  /** While true, Escape and clicking outside do nothing (a request is in flight). */
  busy?: boolean
  onClose: () => void
  width?: 'sm' | 'md'
}

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'

/**
 * A modal dialog: focus moves in, Tab stays inside, Escape and a click outside close it (unless busy), and focus
 * goes back to where it was when it closes.
 */
export function Modal({
  title,
  children,
  role = 'dialog',
  initialFocus,
  busy = false,
  onClose,
  width = 'sm',
}: ModalProps) {
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    ;(initialFocus?.current ?? dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE))?.focus()
    return () => previous?.focus?.()
    // The focus target is chosen once, when the modal opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      if (!busy) onClose()
      return
    }
    if (event.key !== 'Tab') return
    const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])]
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
      onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}
    >
      <div
        ref={dialogRef}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
        className={`max-h-[90vh] w-full overflow-auto rounded-xl border border-neutral-200 bg-white p-5 shadow-xl dark:border-neutral-700 dark:bg-neutral-900 ${
          width === 'md' ? 'max-w-lg' : 'max-w-sm'
        }`}
      >
        <h2 id={titleId} className="text-lg font-semibold">
          {title}
        </h2>
        {children}
      </div>
    </div>
  )
}
