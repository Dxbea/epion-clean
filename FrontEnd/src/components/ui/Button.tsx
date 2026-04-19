import React from 'react'
import clsx from 'clsx'

type Variant =
  | 'primary'
  | 'ghost'
  | 'destructive'

const base =
  'inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition-[transform,opacity,filter,background-color,border-color,color] duration-200 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAFAF5] active:scale-[0.98] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 dark:focus-visible:ring-offset-neutral-950'

const primaryStyles =
  'border border-[#D9E0E4] bg-white text-neutral-900 hover:scale-[0.98] hover:border-[#AEE6EA] hover:bg-[linear-gradient(135deg,rgba(255,255,255,0.98)_0%,rgba(231,250,251,0.98)_52%,rgba(244,251,226,0.98)_100%)] hover:text-neutral-950 focus-visible:ring-brand-blue dark:border-white/12 dark:bg-white/[0.04] dark:text-neutral-100 dark:hover:border-[#7BD2D8]/38 dark:hover:bg-[linear-gradient(135deg,rgba(255,255,255,0.05)_0%,rgba(44,152,160,0.16)_52%,rgba(183,232,124,0.12)_100%)] dark:hover:text-white dark:focus-visible:ring-brand-blue'

const ghostStyles =
  'border border-surface-200 bg-transparent text-neutral-900 hover:bg-black/5 focus-visible:ring-surface-200 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-white/10 dark:focus-visible:ring-neutral-600'

const styles: Record<Variant, string> = {
  primary: primaryStyles,
  ghost: ghostStyles,
  destructive:
    'border border-red-600 bg-red-600 text-white hover:opacity-92 hover:brightness-105 focus-visible:ring-red-500 dark:border-red-500 dark:bg-red-500 dark:hover:bg-red-400 dark:hover:opacity-100 dark:hover:brightness-100 dark:focus-visible:ring-red-400',
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
