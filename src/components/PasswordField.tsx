import { useState, type ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { TextField } from './TextField'

type PasswordFieldProps = Omit<ComponentProps<typeof TextField>, 'type' | 'trailing'>

/**
 * A password input with a button that reveals what was typed. It starts hidden and goes back to hidden when the
 * field unmounts (e.g. a dialog closing). Toggling changes only the input `type`: the value, the selection and
 * the focus stay where they were.
 */
export function PasswordField(props: PasswordFieldProps) {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(false)

  return (
    <TextField
      {...props}
      type={visible ? 'text' : 'password'}
      trailing={
        <button
          type="button"
          aria-label={visible ? t('password.hide') : t('password.show')}
          onClick={() => setVisible((v) => !v)}
          // Keep the caret in the input when the button is clicked with the mouse.
          onMouseDown={(event) => event.preventDefault()}
          className="rounded p-1.5 text-neutral-600 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-500 dark:text-neutral-400 dark:hover:bg-neutral-800"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            className="size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M1.5 10S4.5 4.5 10 4.5 18.5 10 18.5 10 15.5 15.5 10 15.5 1.5 10 1.5 10Z" />
            <circle cx="10" cy="10" r="2.5" />
            {visible && <path d="M3 3l14 14" />}
          </svg>
        </button>
      }
    />
  )
}
