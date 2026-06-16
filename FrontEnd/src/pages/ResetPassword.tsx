// DEBUT BLOC (remplace tout ce qui est entre ce commentaire et "FIN BLOC")
import React from 'react';
import { useNavigate } from 'react-router-dom';
import PageContainer from '@/components/ui/PageContainer';
import { H2, Body, Button } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { authClient } from '@/lib/better-auth-client';

function getTokenFromUrl(): string | null {
  // 1) query ?token= / ?resetToken=
  const sp = new URLSearchParams(window.location.search);
  const q = sp.get('token') || sp.get('resetToken');
  if (q) return q;

  // 2) hash #...&token= / #...&resetToken=
  const hash = window.location.hash || '';
  if (hash.includes('token=')) {
    const hp = new URLSearchParams(hash.replace(/^.*\?/, ''));
    return hp.get('token') || hp.get('resetToken');
  }
  return null;
}

function getErrorFromUrl(): string | null {
  const sp = new URLSearchParams(window.location.search);
  const q = sp.get('error');
  if (q) return q;

  const hash = window.location.hash || '';
  if (hash.includes('error=')) {
    const hp = new URLSearchParams(hash.replace(/^.*\?/, ''));
    return hp.get('error');
  }
  return null;
}

function getResetRedirectTo() {
  if (typeof window === 'undefined') return '/reset-password';
  return `${window.location.origin}/reset-password`;
}

function pwErr(pw: string) {
  if (pw.length < 8) return 'Password must be at least 8 characters.';
  if (!/[A-Z]/.test(pw)) return 'Add at least one uppercase letter.';
  if (!/[a-z]/.test(pw)) return 'Add at least one lowercase letter.';
  if (!/[0-9]/.test(pw)) return 'Add at least one number.';
  if (!/[^A-Za-z0-9]/.test(pw)) return 'Add at least one special character.';
  return null;
}

export default function ResetPassword() {
  const { push } = useToast();
  const navigate = useNavigate();

  // --- Section 1: demander un lien (pas de validation lourde email, juste requis)
  const [email, setEmail] = React.useState('');
  const [emailErr, setEmailErr] = React.useState<string | null>(null);
  const [reqErr, setReqErr] = React.useState<string | null>(null);
  const [loadingReq, setLoadingReq] = React.useState(false);
  const [devUrl, setDevUrl] = React.useState<string | null>(null);

  // --- Section 2: définir un nouveau mot de passe
  const [token] = React.useState<string | null>(() => getTokenFromUrl());
  const [urlError] = React.useState<string | null>(() => getErrorFromUrl());
  const [newPwd, setNewPwd] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [pwdErr, setPwdErr] = React.useState<string | null>(null);
  const [confirmErr, setConfirmErr] = React.useState<string | null>(null);
  const [formErr, setFormErr] = React.useState<string | null>(null);
  const [loadingSet, setLoadingSet] = React.useState(false);

  // reset erreurs lorsqu'on tape
  React.useEffect(() => { setEmailErr(null); setReqErr(null); }, [email]);
  React.useEffect(() => { setPwdErr(null); setConfirmErr(null); setFormErr(null); }, [newPwd, confirm]);

  async function requestLink() {
    setReqErr(null);
    if (!email.trim()) { setEmailErr('Please enter your email.'); return; }

    try {
      setLoadingReq(true);
      const res = await authClient.requestPasswordReset({
        email: email.trim().toLowerCase(),
        redirectTo: getResetRedirectTo(),
      });

      if (res.error) throw new Error(res.error.message || `HTTP ${res.error.status || 400}`);

      setDevUrl(null);
      push('If this email exists, a reset link has been generated.', 'success');
    } catch {
      // message générique anti-énumération
      push('If this email exists, a reset link has been generated.', 'success');
    } finally {
      setLoadingReq(false);
    }
  }

  async function setNewPassword() {
    setFormErr(null);

    if (!token) {
      setFormErr('Missing or invalid link.');
      return;
    }
    if (!newPwd) {
      setPwdErr('Please enter a new password.');
      return;
    }
    const pe = pwErr(newPwd);
    if (pe) {
      setPwdErr(pe);
      return;
    }
    if (!confirm) {
      setConfirmErr('Please confirm your password.');
      return;
    }
    if (newPwd !== confirm) {
      setConfirmErr('Passwords do not match.');
      return;
    }

    try {
      setLoadingSet(true);
      const res = await authClient.resetPassword({
        token,
        newPassword: newPwd,
      });
      if (res.error) {
        const code = String((res.error as { code?: string }).code || res.error.message || '');
        if (res.error.status === 400 && (code.includes('PASSWORD_TOO_SHORT') || code.includes('Password is too short'))) {
          setPwdErr('Password must be at least 8 characters.');
        } else if (res.error.status === 400) {
          setFormErr('Invalid or expired link.');
        } else {
          setFormErr('Something went wrong.');
        }
        return;
      }
      push('Password changed. You can now login.', 'success');
      navigate('/settings#account', { replace: true });
    } catch {
      setFormErr('Something went wrong.');
    } finally {
      setLoadingSet(false);
    }
  }

  return (
    <PageContainer className="py-10 space-y-6">
      {!token ? (
        <>
          <H2>Reset your password</H2>
          <Body>
            {urlError
              ? 'This reset link is invalid or has expired. Enter your email to request a new one.'
              : 'Enter your email. If an account exists, we will send a reset link.'}
          </Body>

          <div className="max-w-md space-y-3">
            <div>
              <input
                type="text"
                className={`w-full rounded-xl border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-blue dark:border-neutral-800 dark:bg-neutral-950 ${
                  emailErr ? 'border-red-500' : 'border-surface-200'
                }`}
                placeholder="you@example.com"
                value={email}
                onChange={e=>setEmail(e.target.value)}
                autoComplete="email"
              />
              {emailErr && <p className="mt-1 text-xs text-red-600" aria-live="polite">{emailErr}</p>}
            </div>

            {reqErr && <p className="text-sm text-red-600" aria-live="polite">{reqErr}</p>}

            <Button variant="primary" onClick={requestLink} disabled={!email.trim() || loadingReq}>
              {loadingReq ? 'Sending…' : 'Send reset link'}
            </Button>

            {devUrl && (
  <div className="rounded-xl border border-dashed border-surface-200 p-3 text-sm dark:border-neutral-800">
    Dev link:{" "}
    <a className="underline break-all" href={devUrl}>{devUrl}</a>
    <button
      type="button"
      onClick={() => { navigator.clipboard.writeText(devUrl).catch(()=>{}); push('Link copied', 'success'); }}
      className="ml-2 rounded-md border px-2 py-1 text-xs hover:bg-black/5 dark:hover:bg-white/10"
    >
      Copy
    </button>
  </div>
)}

          </div>
        </>
      ) : (
        <>
          <H2>Choose a new password</H2>
          <div className="max-w-md space-y-3">
            <div>
              <input
                type="password"
                className={`w-full rounded-xl border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-blue dark:border-neutral-800 dark:bg-neutral-950 ${
                  pwdErr ? 'border-red-500' : 'border-surface-200'
                }`}
                placeholder="New password"
                value={newPwd}
                onChange={e=>setNewPwd(e.target.value)}
                autoComplete="new-password"
              />
              {pwdErr && <p className="mt-1 text-xs text-red-600" aria-live="polite">{pwdErr}</p>}
              <p className="mt-1 text-[11px] opacity-70">
                8+ chars, 1 upper, 1 lower, 1 number, 1 special.
              </p>
            </div>

            <div>
              <input
                type="password"
                className={`w-full rounded-xl border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-blue dark:border-neutral-800 dark:bg-neutral-950 ${
                  confirmErr ? 'border-red-500' : 'border-surface-200'
                }`}
                placeholder="Confirm password"
                value={confirm}
                onChange={e=>setConfirm(e.target.value)}
                autoComplete="new-password"
              />
              {confirmErr && <p className="mt-1 text-xs text-red-600" aria-live="polite">{confirmErr}</p>}
            </div>

            {formErr && <p className="text-sm text-red-600" aria-live="polite">{formErr}</p>}

            <Button
              variant="primary"
              onClick={setNewPassword}
              disabled={!newPwd || !confirm || loadingSet}
            >
              {loadingSet ? 'Saving…' : 'Set new password'}
            </Button>
          </div>
        </>
      )}
    </PageContainer>
  );
}
// FIN BLOC
