import type { ComponentProps } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const styles: Record<Variant, string> = {
  primary:
    'bg-indigo-600 text-white hover:bg-indigo-500 disabled:bg-indigo-600/50 dark:bg-indigo-500 dark:hover:bg-indigo-400',
  secondary:
    'border border-neutral-300 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800',
  ghost: 'hover:bg-neutral-100 dark:hover:bg-neutral-800',
  danger: 'bg-red-600 text-white hover:bg-red-500 disabled:bg-red-600/50',
}

export function Button({
  variant = 'primary',
  className = '',
  type = 'button',
  ...props
}: ComponentProps<'button'> & { variant?: Variant }) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:opacity-70 ${styles[variant]} ${className}`}
      {...props}
    />
  )
}
