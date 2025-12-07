// src/pages/Account/MyAccount.tsx
import React from 'react'
import { H2, Lead } from '@/components/ui/Typography'
import FormSection from '@/components/settings/FormSection'
import AccountProfileForm from '@/components/account/AccountProfileForm'
import SecurityShortcuts from '@/components/account/SecurityShortcuts'
import BillingPlaceholder from '@/components/account/BillingPlaceholder'
import DangerZone from '@/components/account/DangerZone'
import { useI18n } from '@/i18n/I18nContext'
import { Link } from 'react-router-dom'
import PageContainer from '@/components/ui/PageContainer'
import Breadcrumbs from '@/components/ui/Breadcrumbs'
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges'
import { AccountAuthBoxFull } from '@/components/settings/AccountAuthBox';
import AccountPanelFull from '@/components/account/AccountPanelFull';
import AccountChangeEmailBox from '@/components/account/AccountChangeEmailBox';

// ⬇️ AJOUTE CET IMPORT
import VerifyEmailBanner from '@/components/account/VerifyEmailBanner';

export default function MyAccount(){
  const { t } = useI18n()

  return (
    <PageContainer className="py-10">
      <Breadcrumbs />
      <header className="mb-6">
        <H2>{t('my_account')}</H2>
        <Lead className="mt-1">{t('my_account_lead')}</Lead>
        <div className="mt-3 flex items-center justify-end">
          <Link
            to="/settings"
            className="rounded-xl border border-surface-200 px-3 py-2 text-sm hover:bg-surface-100 dark:border-neutral-800 dark:hover:bg-neutral-900"
          >
            {t('settings_title')}
          </Link>
        </div>
      </header>

      {/* ⬇️ BANNIÈRE DE VÉRIFICATION (seulement si email non vérifié) */}
      <VerifyEmailBanner />

      <div className="space-y-10">
        <AccountProfileForm />
        <SecurityShortcuts />
        <BillingPlaceholder />
        <DangerZone />
      </div>
    </PageContainer>
  )
}
