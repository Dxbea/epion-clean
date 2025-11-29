import React from 'react'
import FormSection from '@/components/settings/FormSection'
import Button from '@/components/ui/Button'
import { useI18n } from '@/i18n/I18nContext'

export default function TwoFAPlaceholder({ id }: { id?: string }){
  const { t } = useI18n()
  return (
    <FormSection id={id} title={t('twofa')} description={t('twofa_desc')}>
      <div className="flex items-center justify-between rounded-2xl border border-dashed border-surface-200 p-4 dark:border-neutral-800">
        <p className="text-sm text-neutral-600 dark:text-neutral-400">{t('not_available_yet')}</p>
        <Button variant="ghost" disabled>{t('enable_2fa_soon')}</Button>
      </div>
    </FormSection>
  )
}