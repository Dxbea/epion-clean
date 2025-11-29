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
      await fetch(`${API_BASE}/api/auth/request-verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email }),
      });
      push('If this email exists, we sent a verification link.', 'success')
    }catch {
  push('Could not send verification email. Try again.', 'error') // ⬅️ NEW
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
