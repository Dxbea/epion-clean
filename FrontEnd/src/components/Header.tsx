// src/components/Header.tsx
import React, { JSX } from 'react'
import { NavLink, Link } from 'react-router-dom'
import { ThemeToggle } from './ThemeToggle'
import MobileDrawer from './MobileDrawer'
import logoLight from '@/assets/LG_Text_Noir.png'
import logoDark from '@/assets/LG_text_Blanc.png'
import HeaderUserMenu from '@/layout/HeaderUserMenu'
import { useI18n } from '@/i18n/I18nContext'

export default function Header(
  props: React.HTMLAttributes<HTMLElement>
): JSX.Element {
  const [open, setOpen] = React.useState(false)
  const { t, locale } = useI18n()
  const { className = '', ...rest } = props

  const NAV_LINKS = React.useMemo(
    () => [
      { to: '/chat', label: t('nav_chat') || 'Chat' },
      { to: '/actuality', label: t('nav_actuality') || 'Actuality' },
    ],
    [t, locale]
  )

  return (
    <header
      {...rest}
      data-app-header
      className={`
        sticky top-0 z-40 w-full
        border-b border-black/10 bg-white/90
        backdrop-blur-sm
        shadow-[0_4px_16px_-4px_rgba(0,0,0,0.15)]
        dark:border-white/10 dark:bg-neutral-950/90
        dark:shadow-[0_4px_16px_-4px_rgba(0,0,0,0.6)]
        transition-all
        ${className}
      `}
    >
      <div
        className="
          mx-auto flex h-16 max-w-7xl items-center justify-between gap-3
          px-4 sm:px-6 lg:px-8
        "
      >
        {/* burger mobile */}
        <button
          aria-label="Open menu"
          onClick={() => setOpen(true)}
          className="
            lg:hidden rounded-lg border border-black/10 bg-white/70 p-2 text-sm
            hover:bg-white
            dark:border-white/10 dark:bg-neutral-900/80 dark:text-neutral-100
            dark:hover:bg-neutral-900
            transition
          "
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        {/* logo */}
        <Link to="/" className="flex items-center gap-3 select-none">
          <img
            src={logoLight}
            alt="epion"
            className="h-6 dark:hidden"
            draggable={false}
          />
          <img
            src={logoDark}
            alt="epion"
            className="hidden h-6 dark:block"
            draggable={false}
          />
        </Link>

        {/* nav desktop */}
        <nav className="hidden items-center gap-2 lg:flex">
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `
                rounded-xl px-3 py-2 text-[13px] font-medium leading-none
                text-neutral-900 transition
                hover:bg-black/[0.04]
                dark:text-neutral-100 dark:hover:bg-white/[0.07]
                ${
                  isActive
                    ? 'bg-black/[0.06] font-semibold dark:bg-white/[0.09]'
                    : ''
                }
              `
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        {/* right side actions */}
        <div className="ml-auto flex items-center gap-2">
          {/* theme toggle */}
          <ThemeToggle />

          {/* Download button */}
          <Link
            to="/download"
            className="
              hidden sm:inline-flex items-center gap-2
              rounded-xl border border-black/10 bg-white/70 px-3 py-3 text-[13px] font-medium leading-none text-neutral-900
              hover:bg-white
              dark:border-white/10 dark:bg-neutral-900/80 dark:text-neutral-100
              dark:hover:bg-neutral-900
              transition
            "
          >
            {t('nav_download') || 'Download epion'}
          </Link>

          {/* User menu (avatar + dropdown) */}
          <HeaderUserMenu />
        </div>
      </div>

      {/* drawer mobile full menu */}
      <MobileDrawer
        open={open}
        onClose={() => setOpen(false)}
        items={NAV_LINKS}
      />
    </header>
  )
}
