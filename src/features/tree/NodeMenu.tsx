import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { ELLIPSIS } from '@/components/glyphs'

export interface MenuItem {
  id: string
  label: string
  onSelect: () => void
  destructive?: boolean
}

/**
 * The "…" button of a tree row and its menu. The menu is positioned against the viewport so the sidebar's own
 * scrolling cannot clip it, opens on the first item, and closes with Escape, Tab, a click outside or a choice.
 */
export function NodeMenu({ name, items }: { name: string; items: MenuItem[] }) {
  const { t } = useTranslation('tree')
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const open = position !== null

  useEffect(() => {
    if (!open) return
    menuRef.current?.querySelector<HTMLElement>('[role=menuitem]')?.focus()
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target))
        setPosition(null)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  const close = (restoreFocus: boolean) => {
    setPosition(null)
    if (restoreFocus) buttonRef.current?.focus()
  }

  const onMenuKeyDown = (event: KeyboardEvent) => {
    // Keys typed in the menu are the menu's: the tree around it must not also act on them.
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
        event.preventDefault()
        close(true)
        break
      case 'Tab':
        close(false)
        break
    }
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        data-menu-button
        tabIndex={-1}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('actions.open', { name })}
        onClick={(event) => {
          event.stopPropagation()
          if (open) return close(false)
          const rect = event.currentTarget.getBoundingClientRect()
          setPosition({ top: rect.bottom + 4, left: rect.right })
        }}
        className="rounded px-1.5 py-0.5 text-neutral-600 dark:text-neutral-400 opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100 hover:bg-neutral-200 focus-visible:opacity-100 aria-expanded:opacity-100 dark:hover:bg-neutral-700"
      >
        <span aria-hidden="true">{ELLIPSIS}</span>
      </button>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={t('actions.open', { name })}
          onKeyDown={onMenuKeyDown}
          style={{
            position: 'fixed',
            top: position.top,
            left: position.left,
            transform: 'translateX(-100%)',
          }}
          className="z-50 min-w-48 rounded-md border border-neutral-200 bg-white py-1 text-sm shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
        >
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={(event) => {
                event.stopPropagation()
                close(false)
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
      )}
    </>
  )
}
