// src/components/settings/AccountAuthBox.tsx
import * as React from 'react';
import Button from '@/components/ui/Button';
import { H3, Body } from '@/components/ui/Typography';
import { useToast } from '@/components/ui/Toast';
import { useMe } from '@/contexts/MeContext';
import { Link } from 'react-router-dom';
import { API_BASE } from '@/config/api';
import { withCsrf } from '@/lib/csrf';

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
    displayName: string
  ) => Promise<void>;
}) {
  // state invité
  const [mode, setMode] = React.useState<'login' | 'signup'>('login');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [displayName, setDisplayName] = React.useState('');
  const [showPw, setShowPw] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const [emailErr, setEmailErr] = React.useState<string | null>(null);
  const [pwErr, setPwErr] = React.useState<string | null>(null);
  const [formErr, setFormErr] = React.useState<string | null>(null);

  // reset erreurs quand on tape
  React.useEffect(() => {
    setEmailErr(null);
    setFormErr(null);
  }, [email, mode]);
  React.useEffect(() => {
    setPwErr(null);
    setFormErr(null);
  }, [password, mode]);
  React.useEffect(() => {
    setFormErr(null);
  }, [displayName]);

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

    try {
      setBusy(true);
      await onSignup(email, password, displayName.trim());
    } catch (err: any) {
      const status = httpStatusFromErr(err);
      if (status === 409) {
        setEmailErr('This email is already linked to an account.');
      } else {
        setFormErr('Something went wrong. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  const handleSubmit = mode === 'login' ? handleLogin : handleSignup;

  return (
    <div className="grid gap-3 md:max-w-md">
      <div className="mb-3 flex items-center gap-2">
        <H3 as="div" className="text-base">
          {mode === 'login' ? 'Sign in' : 'Create account'}
        </H3>
        <Button
          variant="ghost"
          onClick={() => {
            setMode(m => (m === 'login' ? 'signup' : 'login'));
            setFormErr(null);
          }}
        >
          {mode === 'login' ? 'Switch to Signup' : 'Switch to Login'}
        </Button>
      </div>

      <form noValidate onSubmit={handleSubmit} className="grid gap-3">
        {mode === 'signup' && (
          <div>
            <label className="mb-1 block text-sm">Display name</label>
            <input
              className="w-full rounded-xl border border-surface-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-blue dark:border-neutral-800 dark:bg-neutral-950"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="Jane Doe"
            />
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm">Email</label>
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            className={`w-full rounded-xl border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-blue dark:border-neutral-800 dark:bg-neutral-950 ${
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
              className={`no-native-reveal w-full rounded-xl border bg-white px-3 py-2 pr-12 text-sm outline-none focus:ring-2 focus:ring-brand-blue dark:border-neutral-800 dark:bg-neutral-950 ${
                pwErr ? 'border-red-500' : 'border-surface-200'
              }`}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={mode === 'login' ? '••••••••' : 'At least 8 characters'}
            />
            <button
              type="button"
              aria-label={showPw ? 'Hide password' : 'Show password'}
              onClick={() => setShowPw(s => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs hover:bg-surface-100 dark:hover:bg-neutral-900"
            >
              {showPw ? 'Hide' : 'Show'}
            </button>
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

        <div className="mt-1 flex items-center gap-2">
          <Button type="submit" variant="primary" disabled={busy}>
            {busy
              ? 'Please wait…'
              : mode === 'login'
              ? 'Sign in'
              : 'Create account'}
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
      await fetch(
        `${API_BASE}/api/auth/forgot-password`,
        await withCsrf({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: me.email }),
        }),
      );
      push('If this email exists, a reset link has been generated.', 'success');
    } catch {
      push('If this email exists, a reset link has been generated.', 'success');
    } finally {
      setLinkBusy(false);
    }
  }

  return (
    <div
      className="
        rounded-2xl border border-surface-200 p-4
        dark:border-neutral-800
      "
    >
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
      <div className="rounded-2xl border border-surface-200 p-4 dark:border-neutral-800">
        <GuestAuthForm
          onLogin={async (email, pw) => {
            await login(email, pw);
            await refresh();
            push('Connected', 'success');
          }}
          onSignup={async (email, pw, dn) => {
            await signup(email, pw, dn);
            await refresh();
            push('Account created & connected', 'success');
          }}
        />
      </div>
    );
  }

  // connecté (vue légère)
  return (
    <div className="rounded-2xl border border-surface-200 p-4 dark:border-neutral-800">
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
      <div className="rounded-2xl border border-surface-200 p-4 dark:border-neutral-800">
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
