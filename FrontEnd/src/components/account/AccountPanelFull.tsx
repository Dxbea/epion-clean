// AccountPanelFull.tsx (tu peux garder le nom que tu veux)
// Remplace ton bloc actuel de la page /account par ceci

import * as React from 'react';
import { Link } from 'react-router-dom';
import { API_BASE } from '@/config/api';
import { useMe } from '@/contexts/MeContext';
import { useToast } from '@/components/ui/Toast';

export default function AccountPanelFull() {
  const { me } = useMe();
  const { push } = useToast();

  // local state
  const [newEmail, setNewEmail] = React.useState('');
  const [chgBusy, setChgBusy] = React.useState(false);

  const [linkBusy, setLinkBusy] = React.useState(false);

  if (!me) {
    // normalement tu ne vois pas cette page sans être connecté,
    // mais on met un fallback safe:
    return (
      <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-[0_24px_48px_-12px_rgba(0,0,0,0.08)] dark:border-white/10 dark:bg-neutral-950 dark:text-neutral-100 dark:shadow-[0_24px_48px_-12px_rgba(0,0,0,0.8)]">
        <p className="text-sm">
          You’re not signed in. Please go to Settings → Account to sign in.
        </p>
      </div>
    );
  }

  // helpers
  async function requestEmailChange() {
    if (!newEmail.trim()) return;
    try {
      setChgBusy(true);
      const res = await fetch(`${API_BASE}/api/auth/change-email-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ newEmail: newEmail.trim().toLowerCase() }),
      });

      // en dev l'API peut renvoyer { verifyUrl }
      const j = await res.json().catch(() => ({} as any));
      if (j?.verifyUrl) {
        await navigator.clipboard.writeText(j.verifyUrl).catch(() => {});
      }

      push('If this address is valid, we sent a verification link.', 'success');
      setNewEmail('');
    } catch {
      push('If this address is valid, we sent a verification link.', 'success');
    } finally {
      setChgBusy(false);
    }
  }

  async function sendResetLink() {
    if (!me?.email) return;
    try {
      setLinkBusy(true);
      await fetch(`${API_BASE}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: me.email }),
      });
      push('If this email exists, a reset link has been generated.', 'success');
    } catch {
      push('If this email exists, a reset link has been generated.', 'success');
    } finally {
      setLinkBusy(false);
    }
  }

  const displayName =
    me.displayName?.trim() ||
    me.username?.trim() ||
    me.email?.split('@')[0] ||
    'Account';

  const isVerified = Boolean(me.emailVerifiedAt);

  return (
    <section
      className="
        rounded-2xl border border-black/10 bg-white p-6
        shadow-[0_24px_48px_-12px_rgba(0,0,0,0.08)]
        dark:border-white/10 dark:bg-neutral-950 dark:text-neutral-100
        dark:shadow-[0_24px_48px_-12px_rgba(0,0,0,0.8)]
      "
    >
      {/* HEADER: titre + who you are */}
      <header className="mb-6">
        <h2 className="text-2xl font-[600] leading-snug text-neutral-900 dark:text-neutral-100 font-display">
          Your account
        </h2>

        <div className="mt-4 text-[15px] leading-relaxed text-neutral-800 dark:text-neutral-200">
          <div>
            Signed in as{' '}
            <span className="font-semibold text-neutral-900 dark:text-white">
              {displayName}
            </span>
          </div>
          <div className="opacity-80">{me.email}</div>
        </div>
      </header>


      {/* CHANGE EMAIL */}
      <section className="mb-8">
        <h3 className="mb-3 text-lg font-[600] text-neutral-900 dark:text-neutral-100 font-display">
          Change email
        </h3>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="new@email.com"
            className="
              w-full rounded-xl border border-black/10 bg-white px-3 py-2
              text-sm text-neutral-900 outline-none
              focus:ring-2 focus:ring-[var(--brand-turquoise)]
              dark:border-white/10 dark:bg-neutral-900 dark:text-neutral-100
            "
          />

          <button
            onClick={requestEmailChange}
            disabled={!newEmail || chgBusy}
            className="
              inline-flex shrink-0 items-center justify-center rounded-xl
              bg-neutral-700 px-4 py-2 text-sm font-semibold text-white
              disabled:opacity-50
              dark:bg-neutral-200 dark:text-neutral-900
            "
          >
            {chgBusy ? 'Sending…' : 'Send link'}
          </button>
        </div>

        <p className="mt-2 text-[13px] leading-snug text-neutral-600 dark:text-neutral-400">
          We’ll email a confirmation link to the new address.
        </p>
      </section>

      {/* PASSWORD RESET */}
      <section>
        <h3 className="mb-3 text-lg font-[600] text-neutral-900 dark:text-neutral-100 font-display">
          Forgot your password?
        </h3>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
          <button
            onClick={sendResetLink}
            disabled={linkBusy || !me?.email}
            className="
              inline-flex items-center justify-center rounded-xl border
              border-black/10 bg-white px-4 py-2 text-sm font-semibold
              text-neutral-900 shadow-sm
              hover:bg-black/[0.03]
              disabled:opacity-50
              dark:border-white/10 dark:bg-neutral-900 dark:text-neutral-100
              dark:hover:bg-white/[0.07]
            "
          >
            {linkBusy ? 'Sending…' : 'Email me a secure reset link'}
          </button>

          <Link
            to="/reset-password"
            className="
              text-sm font-medium underline underline-offset-2
              text-neutral-900 hover:opacity-80
              dark:text-neutral-100
            "
          >
            Use a reset token
          </Link>
        </div>

        <p className="mt-2 text-[13px] leading-snug text-neutral-600 dark:text-neutral-400">
          You’ll get a one-time link to set a new password.
        </p>
      </section>
    </section>
  );
}
