import React from 'react'
import PageContainer from '@/components/ui/PageContainer'
import { H2, H3, Body } from '@/components/ui/Typography'
import { useI18n } from '@/i18n/I18nContext'

export default function PrivacyPage() {
  const { t } = useI18n()

  return (
    <PageContainer className="py-10 space-y-6">
      <H2>{t('privacy_title')}</H2>
      <Body>{t('privacy_body_1')}</Body>
      <Body>{t('privacy_body_2')}</Body>
      <div className="space-y-2">
        <H3 as="h2" className="text-xl">{t('privacy_analytics_title')}</H3>
        <Body>{t('privacy_analytics_body')}</Body>
      </div>
    </PageContainer>
  )
}
