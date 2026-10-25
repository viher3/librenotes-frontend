import type { Icon } from '@/data/types'

export type IconKind = 'folder' | 'note' | 'link'

/** What an item shows until the user picks another icon. */
export const DEFAULT_ICONS: Record<IconKind, string> = {
  folder: '📁',
  note: '📄',
  link: '🔗',
}

/** Default icon of a pinned document. A custom icon always wins over it. */
export const PINNED_NOTE_ICON = '📌'

/** Default icon of an encrypted document. A custom icon always wins over it. */
export const ENCRYPTED_NOTE_ICON = '🔒'

/** The emoji to show: the user's own if there is one, otherwise the default of the item type. */
export function iconFor(
  kind: IconKind,
  icon: Icon | undefined,
  pinned = false,
  encrypted = false,
): string {
  if (icon) return icon
  if (kind === 'note' && encrypted) return ENCRYPTED_NOTE_ICON
  return kind === 'note' && pinned ? PINNED_NOTE_ICON : DEFAULT_ICONS[kind]
}
