// src/pages/VerifyEmail.tsx
import React, { useEffect, useState } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { useI18n } from '@/i18n/I18nContext';
import { API_BASE } from '@/config/api';
import PageContainer from '@/components/ui/PageContainer';
import { H2, Body, Button } from '@/components/ui';

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const { t } = useI18n();
  const navigate = useNavigate();

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setErrorMessage(t('invalid_link') || 'Invalid verification link.');
      return;
    }

    let isSubscribed = true;

    async function verify() {
      try {
        const res = await fetch(`${API_BASE}/api/auth/verify-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ token }),
        });

        if (!isSubscribed) return;

        if (res.ok) {
          setStatus('success');
        } else {
          const data = await res.json().catch(() => ({}));
          setStatus('error');
          if (data.error === 'EXPIRED_LINK') {
            setErrorMessage(t('expired_link') || 'Verification link has expired.');
          } else {
            setErrorMessage(t('invalid_link') || 'Invalid or already used verification link.');
          }
        }
      } catch (e) {
        if (!isSubscribed) return;
        setStatus('error');
        setErrorMessage(t('network_error') || 'A network error occurred.');
      }
    }

    verify();

    return () => {
      isSubscribed = false;
    };
  }, [token, t]);

  return (
    <PageContainer className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-full max-w-md rounded-2xl border border-surface-200 bg-white p-8 shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
        
        {status === 'loading' && (
          <div className="flex flex-col items-center gap-4">
            <svg
              className="h-8 w-8 animate-spin text-brand-black dark:text-white"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
            <H2 as="h1" className="text-xl">{t('verifying') || 'Verifying email...'}</H2>
            <Body className="opacity-70">
              {t('please_wait') || 'Please wait while we confirm your email address.'}
            </Body>
          </div>
        )}

        {status === 'success' && (
          <div className="flex flex-col items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <H2 as="h1" className="text-xl">{t('email_verified') || 'Email Verified!'}</H2>
            <Body className="opacity-70">
              {t('email_verified_desc') || 'Your email address has been successfully verified.'}
            </Body>
            <Button
              className="mt-4 w-full"
              variant="primary"
              onClick={() => navigate('/settings#account')}
            >
              {t('go_to_account') || 'Go to my account'}
            </Button>
          </div>
        )}

        {status === 'error' && (
          <div className="flex flex-col items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <H2 as="h1" className="text-xl">{t('verification_failed') || 'Verification Failed'}</H2>
            <Body className="text-red-600 dark:text-red-400">
              {errorMessage}
            </Body>
            <Link to="/" className="mt-4 block w-full">
              <Button className="w-full" variant="ghost">
                {t('back_to_home') || 'Back to home'}
              </Button>
            </Link>
          </div>
        )}

      </div>
    </PageContainer>
  );
}
