// src/components/account/VerifyEmailBanner.tsx
import * as React from 'react';
import { useMe } from '@/contexts/MeContext';
import VerifyEmailActions from '@/components/account/VerifyEmailActions';

export default function VerifyEmailBanner() {
  const { me } = useMe();
  if (!me || me.emailVerifiedAt) return null;

  return (
    <div className="mb-6 rounded-2xl border border-amber-300/60 bg-amber-50 p-4 dark:border-yellow-900/40 dark:bg-yellow-900/20">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm">
          <div className="font-medium">Verify your email</div>
          <div className="opacity-80">
            We’ve sent you a verification link. Didn’t get it? Resend below.
          </div>
        </div>
        <div className="shrink-0">
          <VerifyEmailActions email={me.email} />
        </div>
      </div>
    </div>
  );
}
