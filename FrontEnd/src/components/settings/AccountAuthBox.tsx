// src/components/settings/AccountAuthBox.tsx
import * as React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import Button from '@/components/ui/Button';
import { H3, Body } from '@/components/ui/Typography';
import { useToast } from '@/components/ui/Toast';
import { useMe } from '@/contexts/MeContext';
import { Link } from 'react-router-dom';
import { API_BASE } from '@/config/api';
import { withCsrf } from '@/lib/csrf';
import VerifyEmailActions from '@/components/account/VerifyEmailActions';
import { authClient } from '@/lib/better-auth-client';

/* ----------------------------------
   Helpers communs
---------------------------------- */
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function pwError(pw: string) {
  if (pw.length < 8) return 'Password must be at least 8 characters.';
  if (!/[A-Z]/.test(pw)) return 'Add at least one uppercase letter.';
  if (!/[a-z]/.test(pw)) return 'Add at least one lowercase letter.';
  if (!/[0-9]/.test(pw)) return 'Add at least one number.';
  if (!/[^A-Za-z0-9]/.test(pw)) return 'Add at least one special character.';
  return null;
}

function httpStatusFromErr(e: any): number {
  const m = String(e?.message || '').match(/\b(\d{3})\b/);
  return m ? Number(m[1]) : 500;
}

function betaErrorMessage(error: string) {
  if (error.includes('MISSING_INVITE')) return 'Please enter your beta code.';
  if (error.includes('EXPIRED_INVITE')) return 'This beta code has expired.';
  if (error.includes('INVITE_CODE_FULL')) return 'This beta code has already reached its limit.';
  if (error.includes('INVALID_INVITE')) return 'This beta code is invalid.';
  return 'Invalid or missing beta code. Please check your code.';
}

function PasswordRevealButton({
  show,
  onClick,
}: {
  show: boolean;
  onClick: () => void;
}) {
  const Icon = show ? EyeOff : Eye;

  return (
    <button
      type="button"
      aria-label={show ? 'Hide password' : 'Show password'}
      title={show ? 'Hide password' : 'Show password'}
      onClick={onClick}
      className="absolute right-2 top-1/2 z-10 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-neutral-500 transition hover:bg-black/5 hover:text-neutral-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-neutral-100"
    >
      <Icon aria-hidden="true" size={18} strokeWidth={1.8} />
    </button>
  );
}
/* -----------------------------------------------------------------------------
   GUEST BLOCK (form login / signup)
   réutilisé dans COMPACT et FULL quand me === null
----------------------------------------------------------------------------- */
function GuestAuthForm({
  onLogin,
  onSignup,
}: {
  onLogin: (email: string, pw: string) => Promise<void>;
  onSignup: (
    email: string,
    pw: string,
    displayName: string,
    inviteCode?: string,
  ) => Promise<void>;
}) {
  // state invité
  const [mode, setMode] = React.useState<'login' | 'signup'>('login');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [displayName, setDisplayName] = React.useState('');
  const [showPw, setShowPw] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [betaMode, setBetaMode] = React.useState(false);

  const [emailErr, setEmailErr] = React.useState<string | null>(null);
  const [pwErr, setPwErr] = React.useState<string | null>(null);
  const [inviteErr, setInviteErr] = React.useState<string | null>(null);
  const [formErr, setFormErr] = React.useState<string | null>(null);
  const [needsVerificationEmail, setNeedsVerificationEmail] = React.useState<string | null>(null);

  // Beta invite code from localStorage (set by the beta gate popup)
  const [inviteCode, setInviteCode] = React.useState(() => {
    try { return localStorage.getItem('epion_invite_code') || ''; } catch { return ''; }
  });

  React.useEffect(() => {
    let alive = true;
    fetch(`${API_BASE}/api/auth/beta-status`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (alive) setBetaMode(Boolean(data?.betaMode));
      })
      .catch(() => {
        if (alive) setBetaMode(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  // reset erreurs quand on tape
  React.useEffect(() => {
    setEmailErr(null);
    setFormErr(null);
    setNeedsVerificationEmail(null);
  }, [email, mode]);
  React.useEffect(() => {
    setPwErr(null);
    setFormErr(null);
  }, [password, mode]);
  React.useEffect(() => {
    setFormErr(null);
  }, [displayName]);
  React.useEffect(() => {
    setInviteErr(null);
    setFormErr(null);
  }, [inviteCode]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setFormErr(null);

    if (!email || !emailRegex.test(email)) {
      setEmailErr('Please enter a valid email.');
      return;
    }
    if (!password) {
      setPwErr('Please enter your password.');
      return;
    }

    try {
      setBusy(true);
      await onLogin(email, password);
    } catch (err: any) {
      const status = httpStatusFromErr(err);
      if (status === 401) {
        setFormErr('Incorrect email or password.');
      } else if (status === 403 || String(err?.message || '').includes('EMAIL_NOT_VERIFIED')) {
        setNeedsVerificationEmail(email.trim().toLowerCase());
        setFormErr('Please verify your email before signing in.');
      } else {
        setFormErr('Something went wrong. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setFormErr(null);

    if (!displayName.trim()) {
      setFormErr('Please enter a display name.');
      return;
    }
    if (!email || !emailRegex.test(email)) {
      setEmailErr('Please enter a valid email.');
      return;
    }
    const msg = pwError(password);
    if (msg) {
      setPwErr(msg);
      return;
    }
    if (betaMode && !inviteCode.trim()) {
      setInviteErr('Please enter your beta code.');
      return;
    }

    try {
      setBusy(true);
      await onSignup(email, password, displayName.trim(), inviteCode.trim() || undefined);
      setNeedsVerificationEmail(email.trim().toLowerCase());
      setFormErr('Account created. Check your email to verify your account before signing in.');
      // Clear invite code from localStorage on success
      try { localStorage.removeItem('epion_invite_code'); } catch {}
    } catch (err: any) {
      const status = httpStatusFromErr(err);
      if (status === 409) {
        setEmailErr('This email is already linked to an account.');
      } else {
        // Try to parse the error for invite code issues
        const text = String(err?.message || '');
        if (text.includes('INVITE_CODE') || text.includes('MISSING_INVITE')) {
          setInviteErr(betaErrorMessage(text));
        } else {
          setFormErr('Something went wrong. Please try again.');
        }
      }
    } finally {
      setBusy(false);
    }
  }

  const handleSubmit = mode === 'login' ? handleLogin : handleSignup;
  const switchMode = () => {
    setMode(m => (m === 'login' ? 'signup' : 'login'));
    setFormErr(null);
    setEmailErr(null);
    setPwErr(null);
    setInviteErr(null);
  };

  return (
    <div className="grid gap-4 md:max-w-md">
      <div className="space-y-1">
        <H3 as="div" className="text-base">
          {mode === 'login' ? 'Sign in' : 'Create account'}
        </H3>
        <Body className="text-sm">
          {mode === 'login'
            ? 'Access your Epion account.'
            : 'Create your account with your beta code.'}
        </Body>
      </div>

      <form noValidate onSubmit={handleSubmit} className="grid gap-3">
        {mode === 'signup' && (
          <div>
            <label className="mb-1 block text-sm">Display name</label>
            <input
              className="form-input"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="Jane Doe"
            />
          </div>
        )}

        {mode === 'signup' && betaMode && (
          <div>
            <label className="mb-1 flex items-center gap-2 text-sm">
              Beta code
              <span className="inline-flex items-center rounded-full bg-brand-cyan/20 px-2 py-0.5 text-[10px] font-semibold text-neutral-700 dark:text-neutral-200">Required</span>
            </label>
            <input
              className={`form-input font-mono uppercase tracking-wider ${
                inviteErr ? 'border-red-500' : 'border-surface-200'
              }`}
              value={inviteCode}
              onChange={e => setInviteCode(e.target.value.toUpperCase())}
              placeholder="XXXX-XXXX"
              autoComplete="one-time-code"
            />
            <p className="mt-1 text-xs text-neutral-500">
              Epion is in closed beta. A valid code is required to create an account.
            </p>
            {inviteErr && <p className="mt-1 text-xs text-red-600">{inviteErr}</p>}
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm">Email</label>
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            className={`form-input ${
              emailErr ? 'border-red-500' : 'border-surface-200'
            }`}
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
          {emailErr && <p className="mt-1 text-xs text-red-600">{emailErr}</p>}
        </div>

        <div>
          <label className="mb-1 block text-sm">Password</label>
          <div className="relative">
            <input
              type={showPw ? 'text' : 'password'}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              className={`no-native-reveal form-input pr-12 ${
                pwErr ? 'border-red-500' : 'border-surface-200'
              }`}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={mode === 'login' ? '••••••••' : 'At least 8 characters'}
            />
            <PasswordRevealButton show={showPw} onClick={() => setShowPw(s => !s)} />
          </div>

          {pwErr && <p className="mt-1 text-xs text-red-600">{pwErr}</p>}

          {mode === 'signup' && (
            <p className="mt-1 text-[11px] opacity-70">
              8+ chars, 1 upper, 1 lower, 1 number, 1 special.
            </p>
          )}

          {mode === 'login' && (
            <div className="mt-1">
              <Link
                to="/reset-password"
                className="text-xs underline opacity-80 hover:opacity-100"
              >
                Forgot password?
              </Link>
            </div>
          )}
        </div>

        {formErr && <p className="mt-1 text-sm text-red-600">{formErr}</p>}
        {needsVerificationEmail && (
          <div className="flex flex-wrap items-center gap-2">
            <VerifyEmailActions email={needsVerificationEmail} />
          </div>
        )}

        <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button type="submit" variant="primary" disabled={busy}>
            {busy
              ? 'Please wait…'
              : mode === 'login'
              ? 'Sign in'
              : 'Create account'}
          </Button>
          <Button type="button" variant="ghost" onClick={switchMode}>
            {mode === 'login' ? 'Create account' : 'Sign in instead'}
          </Button>
        </div>
      </form>
    </div>
  );
}

/* -----------------------------------------------------------------------------
   CONNECTED BLOCK (COMPACT)
   - pour Settings (rapide)
   -> seulement : Signed in as..., bouton Account, bouton Logout
----------------------------------------------------------------------------- */
function SignedInCompact({
  me,
  onLogout,
}: {
  me: {
    email: string;
    displayName?: string | null;
    username?: string | null;
  };
  onLogout: () => Promise<void>;
}) {
  const displayLabel =
    me.displayName?.trim() ||
    me.username?.trim() ||
    me.email?.split('@')[0] ||
    'Account';

  return (
    <div className="grid gap-3 md:max-w-md">
      <H3 as="div" className="text-base">Your account</H3>
      <Body className="text-sm">
        Signed in as <span className="font-medium">{displayLabel}</span>
        <br />
        <span className="opacity-80">{me.email}</span>
      </Body>

      <div className="flex flex-wrap items-center gap-2">
        <Button as={Link as any} to="/account">
          My account
        </Button>

        <Button
          variant="ghost"
          onClick={onLogout}
        >
          Logout
        </Button>
      </div>
    </div>
  );
}

/* -----------------------------------------------------------------------------
   CONNECTED BLOCK (FULL)
   - pour /account (page dédiée compte)
   -> tout : change email, reset pw, etc.
----------------------------------------------------------------------------- */
/* ----------------------------------------------------------------------------- */
/* SignedInFull – ici on patch les deux fetch en withCsrf */
/* ----------------------------------------------------------------------------- */

function SignedInFull({
  me,
  onLogout,
  push,
}: {
  me: {
    email: string;
    emailVerifiedAt?: string | null;
    displayName?: string | null;
    username?: string | null;
  };
  onLogout: () => Promise<void>;
  push: (m: string, kind: 'success' | 'error') => void;
}) {
  const [newEmail, setNewEmail] = React.useState('');
  const [chgBusy, setChgBusy] = React.useState(false);
  const [linkBusy, setLinkBusy] = React.useState(false);

  const displayLabel =
    me.displayName?.trim() ||
    me.username?.trim() ||
    me.email?.split('@')[0] ||
    'Account';

  async function requestEmailChange() {
    const trimmed = newEmail.trim().toLowerCase();
    if (!trimmed) return;

    // petite validation avant d’appeler l’API
    if (!emailRegex.test(trimmed)) {
      push('Please enter a valid email.', 'error');
      return;
    }

    try {
      setChgBusy(true);
      const res = await fetch(
        `${API_BASE}/api/auth/change-email-request`,
        await withCsrf({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ newEmail: trimmed }),
        }),
      );
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
      await authClient.requestPasswordReset({
        email: me.email,
        redirectTo: typeof window === 'undefined' ? '/reset-password' : `${window.location.origin}/reset-password`,
      });
      push('If this email exists, a reset link has been generated.', 'success');
    } catch {
      push('If this email exists, a reset link has been generated.', 'success');
    } finally {
      setLinkBusy(false);
    }
  }

  return (
    <div className="settings-subcard">
      <H3 as="div" className="mb-2 text-base">
        Your account
      </H3>

      <Body className="mb-4 text-sm">
        Signed in as{' '}
        <span className="font-medium">{displayLabel}</span>
        <br />
        <span className="opacity-80">{me.email}</span>
      </Body>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="ghost"
          onClick={async () => {
            await onLogout();
            push('Signed out.', 'success');
          }}
        >
          Logout
        </Button>
      </div>

      {/* si tu veux plus tard, tu peux remettre les inputs de change email, reset pw, etc. */}
    </div>
  );
}
/* -----------------------------------------------------------------------------
   EXPORTS PUBLICS
   - AccountAuthBoxCompact : pour Settings
   - AccountAuthBoxFull    : pour /account
----------------------------------------------------------------------------- */

export function AccountAuthBoxCompact() {
  const { me, login, signup, logout, refresh } = useMe();
  const { push } = useToast();

  // invité ?
  if (!me) {
    return (
      <div className="settings-subcard">
        <GuestAuthForm
          onLogin={async (email, pw) => {
            await login(email, pw);
            await refresh();
            push('Connected', 'success');
          }}
          onSignup={async (email, pw, dn, code) => {
            await signup(email, pw, dn, code);
            push('Account created. Check your email to verify your account.', 'success');
          }}
        />
      </div>
    );
  }

  // connecté (vue légère)
  return (
    <div className="settings-subcard">
      <SignedInCompact
        me={me}
        onLogout={async () => {
          await logout();
          push('Signed out.', 'success');
        }}
      />
    </div>
  );
}

// Vue complète = page /account
export function AccountAuthBoxFull() {
  const { me, logout } = useMe();
  const { push } = useToast();

  if (!me) {
    // si pas connecté mais on est sur /account,
    // on peut réutiliser GuestAuthForm direct mais sans wrapper spécial
    return (
      <div className="settings-subcard">
        <H3 as="div" className="text-base mb-3">Sign in</H3>
        <Body className="mb-4 text-sm opacity-80">
          You need an account to manage profile and security.
        </Body>
        {/* version "invité" simplifiée */}
        {/* on ne redéfinit pas ici pour pas faire dupli complet */}
        {/* tu peux si tu veux, mais là on garde simple : */}
        <p className="text-sm">
          Go to <Link className="underline" to="/settings#account">Settings → Account</Link>.
        </p>
      </div>
    );
  }

  return (
    <SignedInFull
      me={me}
      onLogout={async () => {
        await logout();
        push('Signed out.', 'success');
      }}
      push={push}
    />
  );
}

// rétrocompat si d’autres fichiers importent encore "AccountAuthBox"
export default AccountAuthBoxCompact;
