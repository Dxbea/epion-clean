import React from 'react'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/i18n/I18nContext'
import { Sun, Moon, Monitor } from 'lucide-react'

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const { t } = useI18n()

  const Icon = theme === 'system' ? Monitor : theme === 'dark' ? Moon : Sun
  const label = t?.(`theme_${theme}`) || theme

  return (
    <button
      onClick={toggleTheme}
      aria-label="Toggle theme"
      title={t?.('theme')}
      className="inline-flex items-center gap-2 rounded-xl border border-black/10 bg-white/50 px-3 py-2 text-sm transition-all hover:bg-white dark:border-white/10 dark:bg-neutral-900/50 dark:hover:bg-neutral-900"
    >
      <Icon size={16} className="text-neutral-600 dark:text-neutral-400" />
      <span className="hidden sm:inline font-medium text-neutral-700 dark:text-neutral-300">
        {label}
      </span>
    </button>
  )
}
