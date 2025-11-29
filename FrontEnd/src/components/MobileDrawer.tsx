// DEBUT BLOC (remplace tout ce qui est entre ce commentaire et "FIN BLOC")
import * as React from 'react'
import { createPortal } from 'react-dom'
import { Link, NavLink } from 'react-router-dom'

type MobileDrawerProps = {
  open: boolean
  onClose: () => void
  items: Array<{ to: string; label: string }>
}

function MobileDrawerContent({ open, onClose, items }: MobileDrawerProps) {
  if (!open) return null

  return (
    <>
      {/* backdrop */}
      <div
        onClick={onClose}
        className="
          fixed inset-0 z-[99]
          bg-black/40 backdrop-blur-sm
          lg:hidden
        "
      />

      {/* panneau */}
      <div
        className="
          fixed inset-y-0 left-0 z-[100]
          w-[85vw] max-w-sm
          bg-[#FAFAF5] dark:bg-neutral-950
          shadow-2xl
          flex flex-col
          lg:hidden
        "
      >
        {/* header du drawer */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-black/5 dark:border-white/10">
          <span className="text-sm font-medium">Menu</span>
          <button
            onClick={onClose}
            className="rounded-lg border border-black/10 bg-white/80 px-3 py-1 text-sm dark:border-white/10 dark:bg-neutral-900/60"
          >
            Close
          </button>
        </div>

        {/* contenu scrollable */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onClose}
              className={({ isActive }) =>
                `
                block rounded-xl px-3 py-2 text-sm
                ${
                  isActive
                    ? 'bg-black/5 font-medium dark:bg-white/10'
                    : 'hover:bg-black/5 dark:hover:bg-white/5'
                }
              `
              }
            >
              {item.label}
            </NavLink>
          ))}

          {/* petit séparateur */}
          <div className="pt-3 text-xs font-semibold tracking-wide text-black/50 dark:text-white/50">
            Account
          </div>
          <Link
            to="/account"
            onClick={onClose}
            className="block rounded-xl px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5"
          >
            My account
          </Link>
          <Link
            to="/settings"
            onClick={onClose}
            className="block rounded-xl px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5"
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

  // Bloque le scroll du body quand le menu est ouvert
  React.useEffect(() => {
    if (!open) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prevOverflow
    }
  }, [open])

  if (!open) return null

  // Portal vers <body> pour éviter tous les problèmes de z-index / overflow
  return createPortal(<MobileDrawerContent {...props} />, document.body)
}
// FIN BLOC
