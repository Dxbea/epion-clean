import React from 'react'
import clsx from 'clsx'

type Variant = 'primary' | 'action' | 'ghost' | 'outline' | 'link'

const base = 'inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed'
const styles: Record<Variant, string> = {
  primary: 'bg-brand-black text-white hover:bg-neutral-900 focus-visible:ring-brand-black dark:bg-white dark:text-black dark:hover:bg-neutral-200 dark:focus-visible:ring-white',
  action: 'bg-brand-blue text-white hover:bg-brand-blue/90 focus-visible:ring-brand-blue dark:bg-brand-blue dark:hover:bg-brand-blue/80',
  ghost: 'border border-surface-200 text-neutral-900 hover:bg-surface-100 focus-visible:ring-surface-200 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800 dark:focus-visible:ring-neutral-600',
  outline: 'border border-current text-neutral-900 hover:bg-surface-100 focus-visible:ring-surface-200 dark:text-neutral-100',
  link: 'underline underline-offset-4 hover:opacity-80',
}

type Props<T extends React.ElementType> = {
  as?: T
  variant?: Variant
  className?: string
} & Omit<React.ComponentPropsWithoutRef<T>, 'as'>

export default function Button<T extends React.ElementType = 'button'>(
  { as, variant = 'primary', className, ...props }: Props<T>
) {
  const Tag = (as || 'button') as React.ElementType
  return <Tag className={clsx(base, styles[variant], className)} {...props} />
}
