import type { ReactNode } from 'react'

const tones = {
  error: 'border-red-500/50 bg-red-500/10 text-red-800 dark:text-red-200',
  success: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200',
  info: 'border-sky-500/50 bg-sky-500/10 text-sky-800 dark:text-sky-200',
}

/** `error` is announced immediately (role=alert); the others politely (role=status). */
export function Alert({
  tone = 'info',
  children,
}: {
  tone?: keyof typeof tones
  children: ReactNode
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`rounded-md border px-3 py-2 text-sm ${tones[tone]}`}
    >
      {children}
    </div>
  )
}
