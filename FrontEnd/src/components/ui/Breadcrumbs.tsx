import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useI18n } from '@/i18n/I18nContext'

type Crumb = { to?: string; label: string }

export default function Breadcrumbs({ trail }: { trail?: Crumb[] }) {
  const { pathname } = useLocation()
  const { t } = useI18n()

  // défauts intelligents si pas de trail fourni
  const auto: Crumb[] =
    pathname.startsWith('/settings')
      ? [{ to: '/', label: t('nav_home') || 'Home' }, { label: t('settings_title') || 'Settings' }]
      : pathname.startsWith('/account')
      ? [{ to: '/', label: t('nav_home') || 'Home' }, { label: t('my_account') || 'My Account' }]
      : [{ to: '/', label: t('nav_home') || 'Home' }]

  const list = trail ?? auto

  return (
    <nav aria-label="Breadcrumb" className="mb-3 text-sm">
      <ol className="flex flex-wrap items-center gap-1 text-neutral-600 dark:text-neutral-300">
        {list.map((c, i) => {
          const last = i === list.length - 1
          return (
            <li key={i} className="flex items-center gap-1">
              {c.to && !last ? (
                <Link to={c.to} className="rounded px-1 hover:bg-black/5 dark:hover:bg-white/10">{c.label}</Link>
              ) : (
                <span className="px-1 font-medium">{c.label}</span>
              )}
              {!last && <span aria-hidden>›</span>}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
