// src/pages/Contact.tsx
import React from 'react';
import PageContainer from '@/components/ui/PageContainer';
import { H2, Lead, Button } from '@/components/ui';
import { useI18n } from '@/i18n/I18nContext';

export default function Contact(){
  const { t } = useI18n();
  return (
    <PageContainer className="py-10 space-y-4">
      <H2>{t('contact_title')}</H2>
      <Lead>{t('contact_lead')}</Lead>
      <form className="mt-4 grid gap-3 max-w-xl">
        <input className="rounded-xl border border-black/10 px-3 py-2 dark:border-white/10 dark:bg-neutral-950" placeholder={t('contact_name')} />
        <input className="rounded-xl border border-black/10 px-3 py-2 dark:border-white/10 dark:bg-neutral-950" placeholder={t('contact_email')} />
        <textarea rows={5} className="rounded-xl border border-black/10 px-3 py-2 dark:border-white/10 dark:bg-neutral-950" placeholder={t('contact_message')} />
        <Button disabled>{t('contact_send')}</Button>
      </form>
    </PageContainer>
  );
}
