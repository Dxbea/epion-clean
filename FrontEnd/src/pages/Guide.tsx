// src/pages/Guide.tsx
import React from 'react';
import PageContainer from '@/components/ui/PageContainer';
import { H2, Lead, Body } from '@/components/ui';
import { useI18n } from '@/i18n/I18nContext';

export default function Guide(){
  const { t } = useI18n();
  return (
    <PageContainer className="py-10 space-y-6">
      <H2>{t('guide_title')}</H2>
      <Lead>{t('guide_lead')}</Lead>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-black/10 p-4 dark:border-white/10">
          <Body>{t('guide_block_1')}</Body>
        </div>
        <div className="rounded-2xl border border-black/10 p-4 dark:border-white/10">
          <Body>{t('guide_block_2')}</Body>
        </div>
      </div>
    </PageContainer>
  );
}
