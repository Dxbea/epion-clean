import React from 'react'
import clsx from 'clsx'

export type NavItem = { id: string; label: string }

type Props = {
  items: NavItem[]
  className?: string
}

export default function SettingsSidebarNav({ items, className = '' }: Props){
  const [active, setActive] = React.useState<string>(items[0]?.id || 'general')
  // set initial active item based on hash
  React.useEffect(() => {
    const targets = items
      .map(i => document.getElementById(i.id))
      .filter(Boolean) as HTMLElement[]

    const io = new IntersectionObserver((entries) => {
      // pick the most visible entry near the top
      const visible = entries
        .filter(e => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
      if (visible?.target?.id) setActive(visible.target.id)
    }, { rootMargin: '-40% 0px -55% 0px', threshold: [0, 1] })

    targets.forEach(t => io.observe(t))
    return () => io.disconnect()
  }, [items])

  function scrollTo(id: string){
    const el = document.getElementById(id)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    // also update hash (useful to share deep link)
    history.replaceState(null, '', `#${id}`)
  }

  return (
    <nav className={clsx('space-y-1', className)} aria-label="Settings sections">
      {items.map(it => (
        <button
          aria-current={active === it.id ? 'page' : undefined}
          key={it.id}
          type="button"
          onClick={() => scrollTo(it.id)}
          className={clsx(
            'w-full text-left rounded-xl px-3 py-2 text-sm transition',
            active === it.id
              ? 'bg-black/5 dark:bg-white/10 font-semibold'
              : 'hover:bg-black/5 dark:hover:bg-white/10'
          )}
        >
          {it.label}
        </button>
      ))}
    </nav>
  )
}
