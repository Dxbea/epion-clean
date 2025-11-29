// src/pages/Download.tsx
import React from 'react';
import PageContainer from '@/components/ui/PageContainer';
import { H2, Lead, Button } from '@/components/ui';
import { useI18n } from '@/i18n/I18nContext';

export default function Download(){
  const { t } = useI18n();
  return (
    <PageContainer className="py-10 space-y-4">
      <H2>{t('download_title')}</H2>
      <Lead>{t('download_lead')}</Lead>
      <div className="mt-4 flex gap-3">
        <Button disabled>{t('download_desktop')}</Button>
        <Button variant="ghost" disabled>{t('download_mobile')}</Button>
      </div>
    </PageContainer>
  );
}
