// src/components/Header.tsx
import React, { JSX } from 'react'
import { NavLink, Link, useLocation } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { ThemeToggle } from './ThemeToggle'
import MobileDrawer from './MobileDrawer'
import logoLight from '@/assets/LG_Text_Noir.png'
import logoDark from '@/assets/LG_text_Blanc.png'
import HeaderUserMenu from '@/layout/HeaderUserMenu'
import { useI18n } from '@/i18n/I18nContext'
import { Button } from '@/components/ui'

type HeaderProps = React.HTMLAttributes<HTMLElement> & {
  mode?: 'marketing' | 'app'
  title?: string
  backTo?: string
  backLabel?: string
  showPrimaryNav?: boolean
  showDownload?: boolean
}

export default function Header(
  props: HeaderProps
): JSX.Element {
  const [open, setOpen] = React.useState(false)
  const location = useLocation()
  const { t, locale } = useI18n()
  const {
    className = '',
    mode = 'marketing',
    backTo,
    backLabel,
    showPrimaryNav = true,
    showDownload = true,
    ...rest
  } = props
  const isApp = mode === 'app'

  const NAV_LINKS = React.useMemo(
    () => [
      { to: '/chat', label: t('nav_chat') || 'Chat' },
      { to: '/news', label: t('nav_news') || 'news' },
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
        {backTo ? (
          <Button
            as={Link}
            to={backTo}
            variant="secondary"
            size="icon"
            aria-label={backLabel || 'Back'}
            className="min-h-[44px] min-w-[44px] transition-transform duration-300 ease-out hover:scale-[0.98]"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
        ) : showPrimaryNav ? (
          <Button
            variant="secondary"
            size="icon"
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => {
              if (location.pathname.startsWith('/chat')) {
                window.dispatchEvent(new Event('toggleMobileChatDrawer'))
              } else {
                setOpen((value) => !value)
              }
            }}
            className="min-h-[44px] min-w-[44px] transition-transform duration-300 ease-out hover:scale-[0.98] lg:hidden"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={`transition-transform duration-300 ease-out ${open ? 'rotate-90 scale-95' : 'rotate-0 scale-100'}`}
            >
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </Button>
        ) : null}

        <Link to={isApp ? '/news' : '/'} className="flex items-center gap-3 select-none">
          <img
            src={logoLight}
            alt="epion"
            className="h-7 dark:hidden"
            draggable={false}
          />
          <img
            src={logoDark}
            alt="epion"
            className="hidden h-7 dark:block"
            draggable={false}
          />
        </Link>

        {showPrimaryNav && (
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
                  ${isActive
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
        )}

        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />

          {showDownload && (
            <Button
              as={Link}
              to="/download"
              variant="secondary"
              size="auto"
              className="hidden sm:inline-flex h-9 px-4 text-[13px] font-medium"
            >
              {t('nav_download') || 'Download epion'}
            </Button>
          )}

          <HeaderUserMenu />
        </div>
      </div>

      {showPrimaryNav && (
        <MobileDrawer
          open={open}
          onClose={() => setOpen(false)}
          items={NAV_LINKS}
        />
      )}
    </header>
  )
}
