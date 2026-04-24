// DEBUT BLOC (remplace tout ce qui est entre ce commentaire et "FIN BLOC")
import React from 'react'
import { Eye, EyeOff } from 'lucide-react'

type Props = React.InputHTMLAttributes<HTMLInputElement>

export default function PasswordField({ className = '', ...props }: Props){
  const [show, setShow] = React.useState(false)
  const Icon = show ? EyeOff : Eye

  return (
    <div className={`relative ${className}`}>
      <input
        {...props}
        type={show ? 'text' : 'password'}
        className="no-native-reveal w-full rounded-xl border border-surface-200 bg-white px-3 py-2 pr-12 text-sm outline-none focus:ring-2 focus:ring-brand-blue dark:border-neutral-800 dark:bg-neutral-950"
      />
      <button
        type="button"
        onClick={() => setShow(s => !s)}
        aria-label={show ? 'Hide password' : 'Show password'}
        title={show ? 'Hide password' : 'Show password'}
        className="absolute right-2 top-1/2 z-10 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-neutral-500 transition hover:bg-black/5 hover:text-neutral-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-neutral-100"
      >
        <Icon aria-hidden="true" size={18} strokeWidth={1.8} />
      </button>
    </div>
  )
}
// FIN BLOC
