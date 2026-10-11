import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import type { Note } from '@/data/types'
import { unlockContent, type NoteKey } from '@/lib/crypto/envelope'
import { cryptoErrorMessage } from './rules'

interface LockedDocumentProps {
  note: Note
  /** Why a previous attempt to open it failed, if it did. */
  notice?: string
  /** The key is right: the content has been decrypted with it. */
  onUnlocked: (key: NoteKey, plaintext: string) => void
}

/** What an encrypted document shows until its password is given. Only the title is visible. */
export function LockedDocument({ note, notice, onUnlocked }: LockedDocumentProps) {
  const { t } = useTranslation('encryption')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (password === '') {
      setFailure(t('errors.required'))
      return
    }
    setBusy(true)
    setFailure(null)
    try {
      const { noteKey, plaintext } = await unlockContent(note.content, password, note.id)
      onUnlocked(noteKey, plaintext)
    } catch (error) {
      setFailure(cryptoErrorMessage(t, error))
      setBusy(false)
    }
  }

  return (
    <div className="flex max-w-md flex-col gap-3">
      <Breadcrumbs path={note.path} current={note.title} />
      <h2 className="flex items-center gap-2 text-2xl font-semibold">
        <span aria-hidden="true">🔒</span>
        <span className="truncate">{note.title}</span>
      </h2>
      <p className="text-sm font-medium">{t('locked.title')}</p>
      <p className="text-sm text-neutral-600 dark:text-neutral-300">{t('locked.body')}</p>
      <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-3" noValidate>
        <TextField
          type="password"
          autoComplete="off"
          autoFocus
          label={t('locked.password')}
          value={password}
          disabled={busy}
          error={failure ?? notice}
          onChange={(event) => setPassword(event.target.value)}
        />
        <div>
          <Button type="submit" disabled={busy}>
            {busy ? t('locked.unlocking') : t('locked.unlock')}
          </Button>
        </div>
      </form>
    </div>
  )
}
