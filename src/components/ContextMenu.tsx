import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'

export interface ContextMenuItem {
  id: string
  label: string
  onSelect: () => void
  destructive?: boolean
}

/**
 * A menu opened at a point of the viewport (the pointer's position when the right button was pressed). It is kept
 * inside the viewport, opens on the first item, and closes with Escape, Tab, a click outside, scrolling, resizing
 * or a choice. Focus goes back to where it was.
 */
export function ContextMenu({
  label,
  x,
  y,
  items,
  onClose,
}: {
  label: string
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ left: x, top: y })

  // Measured before painting, so the menu never shows at a spot where it would overflow.
  useLayoutEffect(() => {
    const rect = menuRef.current?.getBoundingClientRect()
    if (!rect) return
    setPosition({
      left: Math.max(0, Math.min(x, window.innerWidth - rect.width)),
      top: Math.max(0, Math.min(y, window.innerHeight - rect.height)),
    })
  }, [x, y])

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    menuRef.current?.querySelector<HTMLElement>('[role=menuitem]')?.focus()
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose()
    }
    const close = () => onClose()
    document.addEventListener('mousedown', onPointerDown)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    window.addEventListener('blur', close)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('blur', close)
      // A choice that opens a dialog moves focus on its own: only take it back if nothing else has it.
      if (previous?.isConnected && document.activeElement === document.body) previous.focus()
    }
  }, [onClose])

  const onKeyDown = (event: KeyboardEvent) => {
    event.stopPropagation()
    const entries = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role=menuitem]') ?? [])]
    const index = entries.indexOf(document.activeElement as HTMLElement)
    const focusAt = (i: number) => entries[(i + entries.length) % entries.length]?.focus()

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        focusAt(index + 1)
        break
      case 'ArrowUp':
        event.preventDefault()
        focusAt(index - 1)
        break
      case 'Home':
        event.preventDefault()
        focusAt(0)
        break
      case 'End':
        event.preventDefault()
        focusAt(entries.length - 1)
        break
      case 'Escape':
      case 'Tab':
        event.preventDefault()
        onClose()
        break
    }
  }

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={label}
      onKeyDown={onKeyDown}
      onContextMenu={(event) => event.preventDefault()}
      style={{ position: 'fixed', top: position.top, left: position.left }}
      className="z-50 min-w-48 rounded-md border border-neutral-200 bg-white py-1 text-sm shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          tabIndex={-1}
          onClick={() => {
            onClose()
            item.onSelect()
          }}
          className={`block w-full px-3 py-1.5 text-start hover:bg-neutral-100 focus-visible:bg-neutral-100 focus-visible:outline-none dark:hover:bg-neutral-800 dark:focus-visible:bg-neutral-800 ${
            item.destructive ? 'text-red-600 dark:text-red-400' : ''
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
