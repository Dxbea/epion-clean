// src/components/account/VerifyEmailActions.tsx
import * as React from 'react';
import Button from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { API_BASE } from '@/config/api';
import { useI18n } from '@/i18n/I18nContext';

export default function VerifyEmailActions({ email }: { email: string }) {
  const { push } = useToast();
  const { t } = useI18n();
  const [busy, setBusy] = React.useState(false);

  async function resend() {
    try {
      setBusy(true);
      const res = await fetch(`${API_BASE}/api/auth/email/verification-link`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      push('If this email exists, we sent a verification link.', 'success');
    } catch (e) {
      console.error('verify email error:', e);
      push('Could not send verification email. Try again.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button onClick={resend} disabled={busy}>
      {busy ? t('sending') : t('resend')}
    </Button>
  );
}
