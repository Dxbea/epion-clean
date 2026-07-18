import React from 'react';
import { ArrowLeft, CircleHelp, FileSearch, Scale, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import PageContainer from '@/components/ui/PageContainer';
import { H2, Lead } from '@/components/ui';
import { useI18n } from '@/i18n/I18nContext';

export default function SourceTransparency() {
  const { t } = useI18n();
  const sections = [
    { icon: FileSearch, title: t('source_transparency_what_title'), body: t('source_transparency_what_body') },
    { icon: Scale, title: t('source_transparency_quality_role_title'), body: t('source_transparency_quality_role_body') },
    { icon: CircleHelp, title: t('source_transparency_counterpoint_title'), body: t('source_transparency_counterpoint_body') },
    { icon: ShieldCheck, title: t('source_transparency_score_title'), body: t('source_transparency_score_body') },
  ];

  return (
    <PageContainer className="py-10 sm:py-14">
      <div className="mx-auto max-w-3xl">
        <Link to="/transparency" className="mb-8 inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-950 dark:hover:text-white">
          <ArrowLeft className="h-4 w-4" />
          {t('source_transparency_back')}
        </Link>

        <header className="max-w-2xl border-b border-gray-200 pb-8 dark:border-white/10">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">{t('source_transparency_eyebrow')}</p>
          <H2>{t('source_transparency_title')}</H2>
          <Lead className="mt-4">{t('source_transparency_lead')}</Lead>
        </header>

        <div className="divide-y divide-gray-200 dark:divide-white/10">
          {sections.map(({ icon: Icon, title, body }) => (
            <section key={title} className="grid gap-3 py-7 sm:grid-cols-[36px_1fr]">
              <Icon className="mt-0.5 h-5 w-5 text-gray-500" aria-hidden="true" />
              <div>
                <h2 className="text-base font-semibold text-gray-950 dark:text-white">{title}</h2>
                <p className="mt-2 text-sm leading-7 text-gray-600 dark:text-gray-300">{body}</p>
              </div>
            </section>
          ))}
        </div>

        <section className="border-t border-gray-200 py-8 dark:border-white/10">
          <h2 className="text-base font-semibold text-gray-950 dark:text-white">{t('source_transparency_labels_title')}</h2>
          <p className="mt-2 text-sm leading-7 text-gray-600 dark:text-gray-300">{t('source_transparency_labels_body')}</p>
          <dl className="mt-5 grid gap-x-6 gap-y-4 sm:grid-cols-2">
            {(['very_strong', 'strong', 'nuanced', 'fragile', 'verify', 'unrated'] as const).map((key) => (
              <div key={key} className="border-l-2 border-gray-200 pl-3 dark:border-white/15">
                <dt className="text-sm font-semibold text-gray-900 dark:text-white">{t(`source_transparency_label_${key}`)}</dt>
                <dd className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">{t(`source_transparency_label_${key}_body`)}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="border-t border-gray-200 py-8 dark:border-white/10">
          <h2 className="text-base font-semibold text-gray-950 dark:text-white">{t('source_transparency_information_title')}</h2>
          <p className="mt-2 text-sm leading-7 text-gray-600 dark:text-gray-300">{t('source_transparency_information_body')}</p>
        </section>

        <section className="border-t border-gray-200 py-8 dark:border-white/10">
          <h2 className="text-base font-semibold text-gray-950 dark:text-white">{t('source_transparency_limits_title')}</h2>
          <p className="mt-2 text-sm leading-7 text-gray-600 dark:text-gray-300">{t('source_transparency_limits_body')}</p>
        </section>
      </div>
    </PageContainer>
  );
}
