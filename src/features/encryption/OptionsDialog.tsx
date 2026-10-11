import { useTranslation } from 'react-i18next'
import { Button } from '@/components/Button'
import { Modal } from '@/components/Modal'

interface OptionsDialogProps {
  onChangePassword: () => void
  onRemove: () => void
  onClose: () => void
}

/** What can be done with an encrypted document that is unlocked. */
export function OptionsDialog({ onChangePassword, onRemove, onClose }: OptionsDialogProps) {
  const { t } = useTranslation('encryption')
  return (
    <Modal title={t('manage.title')} onClose={onClose}>
      <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">{t('manage.body')}</p>
      <div className="mt-4 flex flex-col gap-2">
        <Button variant="secondary" onClick={onChangePassword}>
          {t('manage.change')}
        </Button>
        <Button variant="secondary" onClick={onRemove}>
          {t('manage.remove')}
        </Button>
      </div>
      <div className="mt-5 flex justify-end">
        <Button variant="ghost" onClick={onClose}>
          {t('manage.close')}
        </Button>
      </div>
    </Modal>
  )
}
