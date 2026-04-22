import React from 'react'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/i18n/I18nContext'
import { Sun, Moon, Monitor } from 'lucide-react'

import { Button } from '@/components/ui'

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const { t } = useI18n()

  const Icon = theme === 'system' ? Monitor : theme === 'dark' ? Moon : Sun
  const label = t?.(`theme_${theme}`) || theme

  return (
    <Button
      onClick={toggleTheme}
      variant="secondary"
      size="auto"
      aria-label="Toggle theme"
      title={t?.('theme')}
      className="gap-2 h-9 px-3 text-sm"
    >
      <Icon size={16} className="text-neutral-600 dark:text-neutral-400" />
      <span className="hidden sm:inline font-medium text-neutral-700 dark:text-neutral-300">
        {label}
      </span>
    </Button>
  )
}
