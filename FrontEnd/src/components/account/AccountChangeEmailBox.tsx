// src/components/account/AccountChangeEmailBox.tsx
import * as React from 'react';
import { useMe } from '@/contexts/MeContext';
import { useToast } from '@/components/ui/Toast';
import { API_BASE } from '@/config/api';

export default function AccountChangeEmailBox() {
  const { me } = useMe();
  const { push } = useToast();

  const [newEmail, setNewEmail] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  async function requestEmailChange() {
    if (!newEmail.trim()) return;

    try {
      setBusy(true);

      const res = await fetch(`${API_BASE}/api/auth/change-email-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          newEmail: newEmail.trim().toLowerCase(),
        }),
      });

      // backend peut renvoyer { verifyUrl } en dev (copiable)
      const j = await res.json().catch(() => ({}));
      if (j?.verifyUrl) {
        await navigator.clipboard
          .writeText(j.verifyUrl)
          .catch(() => {});
      }

      push(
        'If this address is valid, we sent a verification link.',
        'success'
      );
      setNewEmail('');
    } catch {
      push(
        'If this address is valid, we sent a verification link.',
        'success'
      );
    } finally {
        setBusy(false);
    }
  }

  // petit badge vérification
  const verified = Boolean(me?.emailVerifiedAt);

  return (
    <section
      className="
        rounded-2xl border border-black/10 bg-white p-4 shadow-[0_30px_60px_-15px_rgba(0,0,0,0.07)]
        dark:border-white/10 dark:bg-neutral-950 dark:shadow-[0_30px_60px_-15px_rgba(0,0,0,0.8)]
      "
    >
      {/* header */}
      <div className="mb-4">
        <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100 leading-tight">
          Change email
        </h2>

        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          Update your sign-in email. We’ll confirm via a link before switching.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span
            className="
              rounded-md border border-black/10 bg-white px-2 py-1 font-mono text-[13px] leading-none
              dark:border-white/10 dark:bg-neutral-900 dark:text-neutral-100
            "
          >
            {me?.email || 'unknown@example.com'}
          </span>

          <span
            className={`
              inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium leading-none
              ${verified
                ? 'border-[var(--brand-turquoise)] text-[var(--brand-turquoise)]'
                : 'border-yellow-400 text-yellow-700 dark:border-yellow-500 dark:text-yellow-400'
              }
            `}
          >
            {verified ? 'Verified' : 'Unverified'}
          </span>
        </div>
      </div>

      {/* form change email */}
      <div className="grid gap-2 md:max-w-md">
        <label className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
          New email
        </label>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="new@email.com"
            className="
              w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-neutral-900
              outline-none focus:ring-2 focus:ring-brand-blue
              dark:border-white/10 dark:bg-neutral-950 dark:text-neutral-100
            "
          />

          <button
            type="button"
            onClick={requestEmailChange}
            disabled={!newEmail || busy}
            className="
              shrink-0 whitespace-nowrap
              rounded-xl bg-neutral-900 px-4 py-2 text-sm font-medium text-white
              dark:bg-neutral-100 dark:text-neutral-900
              disabled:opacity-50
            "
          >
            {busy ? 'Sending…' : 'Send link'}
          </button>
        </div>

        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          We’ll email a confirmation link to the new address.
        </p>
      </div>
    </section>
  );
}
