import React from 'react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui';
import { useI18n } from '@/i18n/I18nContext';
import { setTrackingConsent, useTrackingConsent } from '@/lib/tracking-consent';
import { applyTrackingConsent } from '@/lib/tracking-services';

export default function TrackingConsentBanner(): React.JSX.Element | null {
  const consent = useTrackingConsent();
  const { t } = useI18n();

  React.useEffect(() => {
    applyTrackingConsent(consent);
  }, [consent]);

  if (consent !== 'unknown') return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-black/10 bg-[#FAFAF5]/95 px-4 py-4 shadow-[0_-16px_40px_rgba(0,0,0,0.08)] backdrop-blur dark:border-white/10 dark:bg-neutral-950/95">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-3xl text-sm text-neutral-700 dark:text-neutral-300">
          <p className="font-semibold text-neutral-950 dark:text-white">{t('tracking_consent_title')}</p>
          <p className="mt-1">{t('tracking_consent_desc')}</p>
          <Link to="/legal/cookies" className="mt-2 inline-block text-sm font-medium text-brand-blue hover:underline">
            {t('tracking_consent_more')}
          </Link>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="button"
            variant="secondary"
            size="auto"
            onClick={() => setTrackingConsent('denied')}
            className="min-h-[44px] rounded-full px-5 py-2.5 text-sm"
          >
            {t('tracking_consent_decline')}
          </Button>
          <Button
            type="button"
            variant="primary"
            size="auto"
            onClick={() => setTrackingConsent('granted')}
            className="min-h-[44px] rounded-full px-5 py-2.5 text-sm"
          >
            {t('tracking_consent_accept')}
          </Button>
        </div>
      </div>
    </div>
  );
}
