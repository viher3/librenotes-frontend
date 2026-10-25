import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Icon } from '@/data/types'
import { IconPickerDialog } from './IconPickerDialog'
import { iconFor, type IconKind } from './itemIcons'

interface EditableIconProps {
  kind: IconKind
  icon: Icon
  pinned?: boolean
  /** Name of the item, for the dialog's title. */
  name: string
  /** Saves the new icon (`null` restores the default); a rejection is shown in the dialog. */
  onChange: (icon: Icon) => Promise<void>
  describeError: (error: unknown) => string
}

/** The icon of the item being shown, as a button that opens the icon picker. */
export function EditableIcon({
  kind,
  icon,
  pinned = false,
  name,
  onChange,
  describeError,
}: EditableIconProps) {
  const { t } = useTranslation('common')
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        aria-label={t('iconPicker.change')}
        title={t('iconPicker.change')}
        onClick={() => setOpen(true)}
        className="grid size-10 shrink-0 place-items-center rounded-md text-2xl hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:hover:bg-neutral-800"
      >
        <span aria-hidden="true">{iconFor(kind, icon, pinned)}</span>
      </button>
      {open && (
        <IconPickerDialog
          name={name}
          current={icon}
          defaultIcon={iconFor(kind, null, pinned)}
          describeError={describeError}
          onCancel={() => setOpen(false)}
          onSelect={async (next) => {
            await onChange(next)
            setOpen(false)
          }}
        />
      )}
    </>
  )
}
