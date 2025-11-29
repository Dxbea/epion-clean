import React from 'react'
import FormSection from '@/components/settings/FormSection'
import { Body, H3 } from '@/components/ui/Typography'
import Button from '@/components/ui/Button'
import { useI18n } from '@/i18n/I18nContext'

type Billing = { plan: 'Free' | 'Pro'; renewsAt?: string | null }

export default function BillingPlaceholder(){
  const { t } = useI18n()
  const [bill, setBill] = React.useState<Billing>(() => {
    const raw = localStorage.getItem('billing')
    return raw ? JSON.parse(raw) as Billing : { plan: 'Free', renewsAt: null }
  })

  return (
    <FormSection title={t('billing')} description={t('billing_desc')}>
      <div className="grid items-center gap-4 sm:grid-cols-2">
        <div>
          <div className="text-sm text-neutral-600 dark:text-neutral-400">{t('current_plan')}</div>
          <div className="text-base font-medium">{bill.plan}</div>
          <div className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{t('next_billing')}: {bill.renewsAt ? new Date(bill.renewsAt).toLocaleDateString() : '—'}</div>
        </div>
        <div className="flex gap-2 sm:justify-end">
          <Button disabled>{t('manage_billing')}</Button>
          <Button variant="ghost" disabled>{t('view_invoices')}</Button>
        </div>
      </div>
    </FormSection>
  )
}
