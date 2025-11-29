// src/pages/ModerationPolicy.tsx
import React from 'react';
import PageContainer from '@/components/ui/PageContainer';
import { H2, Lead, Body } from '@/components/ui';
import { useI18n } from '@/i18n/I18nContext';

export default function ModerationPolicy(){
  const { t } = useI18n();
  return (
    <PageContainer className="py-10 space-y-4">
      <H2>{t('moderation_title')}</H2>
      <Lead>{t('moderation_lead')}</Lead>
      <div className="rounded-2xl border border-black/10 p-4 dark:border-white/10">
        <Body>{t('moderation_stub')}</Body>
      </div>
    </PageContainer>
  );
}
