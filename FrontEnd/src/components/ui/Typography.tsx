import React from 'react'
import clsx from 'clsx'

const hBase = 'display tracking-tight text-neutral-900 dark:text-neutral-50'

type TypoProps<T extends React.ElementType> = {
  as?: T
  className?: string
} & Omit<React.ComponentPropsWithoutRef<T>, 'as'>

export function H1<T extends React.ElementType = 'h1'>({ as, className, ...props }: TypoProps<T>) {
  const Tag = (as || 'h1') as React.ElementType
  return <Tag className={clsx(hBase, 'text-4xl sm:text-5xl font-extrabold', className)} {...props} />
}
export function H2<T extends React.ElementType = 'h2'>({ as, className, ...props }: TypoProps<T>) {
  const Tag = (as || 'h2') as React.ElementType
  return <Tag className={clsx(hBase, 'text-2xl sm:text-3xl font-bold', className)} {...props} />
}
export function H3<T extends React.ElementType = 'h3'>({ as, className, ...props }: TypoProps<T>) {
  const Tag = (as || 'h3') as React.ElementType
  return <Tag className={clsx(hBase, 'text-xl sm:text-2xl font-semibold', className)} {...props} />
}
export function Body<T extends React.ElementType = 'p'>({ as, className, ...props }: TypoProps<T>) {
  const Tag = (as || 'p') as React.ElementType
  return <Tag className={clsx('text-base text-neutral-700 dark:text-neutral-300', className)} {...props} />
}
export function Lead<T extends React.ElementType = 'p'>({ as, className, ...props }: TypoProps<T>) {
  const Tag = (as || 'p') as React.ElementType
  return <Tag className={clsx('text-lg text-neutral-600 dark:text-neutral-300', className)} {...props} />
}