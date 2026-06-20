import React from 'react';

import PageContainer from '@/components/ui/PageContainer';
import { Body, Button, H2, Lead } from '@/components/ui';
import { useI18n } from '@/i18n/I18nContext';

type Row = {
  name: string;
  type: 'cookie' | 'storage';
  purpose: string;
  duration: string;
  notes?: string;
};

export default function Cookies() {
  const { t } = useI18n();

  const cookies: Row[] = [
    {
      name: 'better-auth.session_token',
      type: 'cookie',
      purpose: t('cookies_auth_purpose'),
      duration: t('cookies_duration_7_days'),
      notes: t('cookies_auth_detail'),
    },
    {
      name: '_ga, _ga_*',
      type: 'cookie',
      purpose: t('cookies_ga_purpose'),
      duration: t('cookies_duration_persistent'),
      notes: t('cookies_ga_detail'),
    },
    {
      name: '/_vercel/insights/script.js',
      type: 'cookie',
      purpose: t('cookies_vercel_purpose'),
      duration: t('cookies_duration_session_or_persistent'),
      notes: t('cookies_vercel_detail'),
    },
    {
      name: 'Sentry Replay / tracing',
      type: 'storage',
      purpose: t('cookies_sentry_purpose'),
      duration: t('cookies_duration_session_or_persistent'),
      notes: t('cookies_sentry_detail'),
    },
  ];

  const storage: Row[] = [
    { name: 'theme', type: 'storage', purpose: t('cookies_theme_purpose'), duration: t('cookies_duration_persistent'), notes: 'localStorage' },
    { name: 'lang', type: 'storage', purpose: t('cookies_lang_purpose'), duration: t('cookies_duration_persistent'), notes: 'localStorage' },
    { name: 'a11y', type: 'storage', purpose: t('cookies_a11y_purpose'), duration: t('cookies_duration_persistent'), notes: 'localStorage' },
    { name: 'privacy', type: 'storage', purpose: t('cookies_privacy_purpose'), duration: t('cookies_duration_persistent'), notes: 'localStorage' },
    { name: 'epion:tracking-consent', type: 'storage', purpose: t('cookies_consent_purpose'), duration: t('cookies_duration_persistent'), notes: 'localStorage' },
    { name: 'notif', type: 'storage', purpose: t('cookies_notif_purpose'), duration: t('cookies_duration_persistent'), notes: 'localStorage' },
    { name: 'sessions', type: 'storage', purpose: t('cookies_sessions_purpose'), duration: t('cookies_duration_persistent'), notes: 'localStorage' },
    { name: 'account', type: 'storage', purpose: t('cookies_account_purpose'), duration: t('cookies_duration_persistent'), notes: 'localStorage' },
  ];

  function clearLocalData() {
    const keys = ['theme', 'lang', 'a11y', 'privacy', 'epion:tracking-consent', 'notif', 'sessions', 'account'];
    keys.forEach((key) => localStorage.removeItem(key));
    alert(t('cookies_cleared'));
  }

  return (
    <PageContainer className="space-y-6 py-8 sm:py-10">
      <H2>{t('cookies_title')}</H2>
      <Lead>{t('cookies_lead')}</Lead>

      <div className="rounded-3xl border border-black/10 p-5 dark:border-white/10 sm:p-6">
        <Body className="mb-4">
          {t('cookies_intro')}
        </Body>

        <Body className="mb-4 font-semibold">{t('cookies_table_title')}</Body>

        <div className="overflow-x-auto">
          <table className="min-w-[680px] w-full text-left text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-black/10 dark:border-white/10">
                <th className="py-3 pr-4 font-medium">{t('cookies_name')}</th>
                <th className="py-3 pr-4 font-medium">{t('cookies_type')}</th>
                <th className="py-3 pr-4 font-medium">{t('cookies_purpose')}</th>
                <th className="py-3 pr-4 font-medium">{t('cookies_duration')}</th>
                <th className="py-3 pr-4 font-medium">{t('cookies_detail')}</th>
              </tr>
            </thead>
            <tbody>
              {cookies.map((row) => (
                <tr key={row.name} className="border-b border-black/5 align-top dark:border-white/5">
                  <td className="py-3 pr-4 font-mono">{row.name}</td>
                  <td className="py-3 pr-4">{row.type === 'cookie' ? t('cookies_type_cookie') : t('cookies_type_storage')}</td>
                  <td className="py-3 pr-4">{row.purpose}</td>
                  <td className="py-3 pr-4">{row.duration}</td>
                  <td className="py-3 pr-4">{row.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-3xl border border-black/10 p-5 dark:border-white/10 sm:p-6">
        <Body className="mb-4 font-semibold">{t('cookies_local_title')}</Body>

        <div className="space-y-3">
          {storage.map((row) => (
            <div key={row.name} className="flex flex-col gap-1 rounded-2xl border border-black/5 p-4 dark:border-white/5">
              <div className="flex flex-wrap items-center gap-2">
                <code className="rounded-md bg-black/5 px-2 py-1 text-[12px] dark:bg-white/10">{row.name}</code>
                <span className="text-xs uppercase tracking-wide opacity-60">{row.duration}</span>
              </div>
              <p className="text-sm text-neutral-700 dark:text-neutral-300">{row.purpose}</p>
              {row.notes ? <p className="text-xs opacity-70">{row.notes}</p> : null}
            </div>
          ))}
        </div>

        <Body className="mt-6">
          {t('cookies_clear_help')}
        </Body>

        <div className="mt-4">
          <Button
            type="button"
            variant="secondary"
            size="auto"
            onClick={clearLocalData}
            className="min-h-[44px] rounded-full px-5 py-2.5 text-sm"
          >
            {t('cookies_clear_button')}
          </Button>
        </div>
      </div>
    </PageContainer>
  );
}
