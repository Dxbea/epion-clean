// DEBUT BLOC (remplace tout ce qui est entre ce commentaire et "FIN BLOC")
import React from 'react'

type Props = React.InputHTMLAttributes<HTMLInputElement>

export default function PasswordField({ className = '', ...props }: Props){
  const [show, setShow] = React.useState(false)
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
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs font-medium text-neutral-600 hover:bg-surface-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
      >
        {show ? 'Hide' : 'Show'}
      </button>
    </div>
  )
}
// FIN BLOC
