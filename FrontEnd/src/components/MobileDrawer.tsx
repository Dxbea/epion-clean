import * as React from 'react'
import { createPortal } from 'react-dom'
import { Link, NavLink } from 'react-router-dom'

import { Button } from '@/components/ui'

type MobileDrawerProps = {
  open: boolean
  onClose: () => void
  items: Array<{ to: string; label: string }>
}

function MobileDrawerContent({ open, onClose, items }: MobileDrawerProps) {
  const [isMounted, setIsMounted] = React.useState(open)
  const [isVisible, setIsVisible] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setIsMounted(true)
      const raf = window.requestAnimationFrame(() => setIsVisible(true))
      return () => window.cancelAnimationFrame(raf)
    }

    setIsVisible(false)
    const timer = window.setTimeout(() => setIsMounted(false), 260)
    return () => window.clearTimeout(timer)
  }, [open])

  if (!isMounted) return null

  return (
    <>
      <div
        onClick={onClose}
        className="fixed inset-0 z-[99] bg-black/40 backdrop-blur-sm transition-opacity duration-300 ease-out lg:hidden"
        style={{ opacity: isVisible ? 1 : 0 }}
      />

      <div
        className="fixed inset-y-0 left-0 z-[100] flex w-[85vw] max-w-sm transform-gpu flex-col bg-[var(--bg)] shadow-2xl transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] lg:hidden"
        style={{
          opacity: isVisible ? 1 : 0,
          transform: isVisible ? 'translateX(0)' : 'translateX(-18px)',
        }}
      >
        <div className="flex items-center justify-between border-b border-black/5 px-4 py-3 dark:border-white/10">
          <span className="text-sm font-medium">Menu</span>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onClose}
              className={({ isActive }) =>
                `block rounded-xl px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? 'bg-black/5 font-medium dark:bg-white/10'
                    : 'hover:bg-black/5 dark:hover:bg-white/5'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}

          <div className="pt-3 text-xs font-semibold tracking-wide text-black/50 dark:text-white/50">
            Account
          </div>
          <Link
            to="/account"
            onClick={onClose}
            className="block rounded-xl px-3 py-2 text-sm transition-colors hover:bg-black/5 dark:hover:bg-white/5"
          >
            My account
          </Link>
          <Link
            to="/settings"
            onClick={onClose}
            className="block rounded-xl px-3 py-2 text-sm transition-colors hover:bg-black/5 dark:hover:bg-white/5"
          >
            Settings
          </Link>
        </div>
      </div>
    </>
  )
}

export default function MobileDrawer(props: MobileDrawerProps) {
  const { open } = props

  React.useEffect(() => {
    if (!open) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
    }
  }, [open])

  return createPortal(<MobileDrawerContent {...props} />, document.body)
}
