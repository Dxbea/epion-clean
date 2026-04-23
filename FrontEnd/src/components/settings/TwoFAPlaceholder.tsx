import React from 'react'

import Button from '@/components/ui/Button'
import { useI18n } from '@/i18n/I18nContext'

export default function TwoFAPlaceholder({ id }: { id?: string }) {
  const { t } = useI18n()

  return (
    <section id={id} className="settings-subcard">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h4 className="font-serif text-3xl font-medium tracking-tight text-neutral-900 dark:text-neutral-50">
            {t('twofa')}
          </h4>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">{t('twofa_desc')}</p>
        </div>
        <Button variant="ghost" disabled className="min-h-[44px] rounded-full px-4">
          {t('enable_2fa_soon')}
        </Button>
      </div>

      <div className="mt-4 rounded-[1.5rem] border border-dashed border-surface-200 p-4 text-sm text-neutral-600 dark:border-neutral-800 dark:text-neutral-400">
        {t('not_available_yet')}
      </div>
    </section>
  )
}
