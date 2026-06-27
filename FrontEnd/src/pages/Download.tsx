// src/pages/Download.tsx
import React from 'react';

import PwaInstallButton from '@/components/PwaInstallButton';
import PageContainer from '@/components/ui/PageContainer';
import { Body, H2, H3, Lead } from '@/components/ui';
import { useI18n } from '@/i18n/I18nContext';

export default function Download() {
  const { t } = useI18n();

  const cards = [
    {
      title: t('download_chrome_title'),
      text: t('download_chrome_desc'),
    },
    {
      title: t('download_ios_title'),
      text: t('download_ios_desc'),
    },
    {
      title: t('download_store_title'),
      text: t('download_store_desc'),
    },
  ];

  return (
    <PageContainer className="py-10">
      <div className="mx-auto flex max-w-3xl flex-col gap-8">
        <div className="space-y-4">
          <H2>{t('download_title')}</H2>
          <Lead>{t('download_lead')}</Lead>
          <PwaInstallButton className="rounded-full px-6 py-3" />
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {cards.map((card) => (
            <section
              key={card.title}
              className="rounded-xl border border-black/10 bg-white/75 p-5 shadow-[0_12px_34px_rgba(15,23,42,0.06)] dark:border-white/10 dark:bg-neutral-950/75"
            >
              <H3 className="text-lg sm:text-xl">{card.title}</H3>
              <Body className="mt-3 text-sm leading-relaxed">{card.text}</Body>
            </section>
          ))}
        </div>

        <Body className="text-sm leading-relaxed text-neutral-500 dark:text-neutral-400">
          {t('download_pwa_note')}
        </Body>
      </div>
    </PageContainer>
  );
}
