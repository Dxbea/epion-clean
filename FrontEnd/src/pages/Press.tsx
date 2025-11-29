// src/pages/Press.tsx
import React from 'react';
import PageContainer from '@/components/ui/PageContainer';
import { H2, Lead, Body, Button } from '@/components/ui';
import { useI18n } from '@/i18n/I18nContext';

export default function Press(){
  const { t } = useI18n();
  return (
    <PageContainer className="py-10 space-y-4">
      <H2>{t('press_title')}</H2>
      <Lead>{t('press_lead')}</Lead>
      <div className="rounded-2xl border border-black/10 p-4 dark:border-white/10">
        <Body>{t('press_stub')}</Body>
        <div className="mt-3"><Button variant="ghost" disabled>{t('press_kit')}</Button></div>
      </div>
    </PageContainer>
  );
}
