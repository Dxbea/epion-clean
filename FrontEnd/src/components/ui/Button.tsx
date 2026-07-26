import React from 'react'
import clsx from 'clsx'

type Variant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'destructive'
  | 'none'

type Size =
  | 'sm'
  | 'default'
  | 'lg'
  | 'icon'
  | 'auto'

const base =
  'relative isolate appearance-none overflow-hidden inline-flex items-center justify-center rounded-xl font-semibold transition-all duration-300 ease-out outline-none ring-0 focus:outline-none focus:ring-0 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#FAFAF5] active:scale-[0.98] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 dark:focus-visible:ring-offset-neutral-950'

const sizeStyles: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-xs',
  default: 'px-4 py-2 text-sm',
  lg: 'px-8 py-3 text-lg',
  icon: 'p-2',
  auto: '', // For buttons that pass their own padding/sizing (e.g. legacy compatibility)
}

const styles: Record<Variant, string> = {
  primary:
    'button-primary bg-epion-ink text-white hover:scale-[0.98] focus-visible:ring-epion-turquoise dark:bg-white dark:text-epion-ink dark:focus-visible:ring-epion-turquoise',
  secondary:
    'border border-black/10 bg-white/70 text-neutral-900 hover:scale-[0.98] hover:bg-white focus-visible:ring-neutral-300 dark:border-white/10 dark:bg-neutral-900/80 dark:text-neutral-100 dark:hover:bg-neutral-800 dark:focus-visible:ring-neutral-700',
  ghost:
    'border border-transparent bg-transparent text-neutral-900 hover:bg-black/5 focus-visible:ring-surface-200 dark:text-neutral-200 dark:hover:bg-white/10 dark:focus-visible:ring-neutral-600',
  destructive:
    'border border-red-600 bg-red-600 text-white hover:opacity-92 hover:brightness-105 focus-visible:ring-red-500 dark:border-red-500 dark:bg-red-500 dark:hover:bg-red-400 dark:hover:opacity-100 dark:hover:brightness-100 dark:focus-visible:ring-red-400',
  none: '',
}

export type ButtonProps<T extends React.ElementType = 'button'> = {
  as?: T
  variant?: Variant
  size?: Size
  className?: string
} & React.ComponentPropsWithoutRef<T>

export const Button = React.forwardRef<any, ButtonProps<any>>(
  ({ as, variant = 'primary', size = 'default', className, ...props }, ref) => {
    const Tag = as || 'button'
    return <Tag ref={ref} className={clsx(base, sizeStyles[size], styles[variant], className)} {...props} />
  }
)

export default Button
