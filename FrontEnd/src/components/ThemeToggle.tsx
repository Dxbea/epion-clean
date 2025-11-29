import React from 'react'

export function ThemeToggle(){
  const [dark, setDark] = React.useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    const s = localStorage.getItem('theme')
    if (s) return s === 'dark'
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches
  })

  React.useEffect(() => {
    const root = document.documentElement
    if (dark) { root.classList.add('dark'); localStorage.setItem('theme','dark') }
    else { root.classList.remove('dark'); localStorage.setItem('theme','light') }
  }, [dark])

  return (
    <button onClick={() => setDark(v=>!v)} aria-label="Toggle theme"
      className="inline-flex items-center rounded-xl border border-surface-200 px-3 py-2 text-sm hover:bg-surface-100 dark:border-neutral-700 dark:hover:bg-neutral-800">
      <span className="hidden sm:inline mr-2">{dark ? 'Dark' : 'Light'} mode</span>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path className="dark:hidden" d="M12 3v2m0 14v2m9-9h-2M5 12H3m14.95 6.95-1.41-1.41M7.46 7.46 6.05 6.05m11.18 0-1.41 1.41M7.46 16.54 6.05 17.95" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/><path className="hidden dark:block" d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" stroke="currentColor" strokeWidth="1.7"/></svg>
    </button>
  )
}
