// FrontEnd/src/contexts/AuthPromptContext.tsx
import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '@/config/api';
import { sanitizePostAuthRedirect } from '@/lib/auth-navigation';

type AuthPromptKind = 'signin' | 'verify_email';

type AuthPromptOptions = {
  title?: string;
  message?: string;
  redirectTo?: string;
  primaryLabel?: string;
  kind?: AuthPromptKind;
};

type AuthPromptContextValue = {
  requireAuth: (opts?: AuthPromptOptions) => void;
};

const AuthPromptContext = React.createContext<AuthPromptContextValue>({
  requireAuth: () => {},
});

export function useAuthPrompt() {
  return React.useContext(AuthPromptContext);
}

/* ─── Beta status cache ─── */
let _betaStatusCache: boolean | null = null;

async function fetchBetaStatus(): Promise<boolean> {
  if (_betaStatusCache !== null) return _betaStatusCache;
  try {
    const res = await fetch(`${API_BASE}/api/auth/beta-status`);
    const data = await res.json();
    _betaStatusCache = !!data?.betaMode;
    return _betaStatusCache;
  } catch {
    return false;
  }
}

export function AuthPromptProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState<string>('Sign in required');
  const [message, setMessage] = React.useState<string>('');
  const [redirectTo, setRedirectTo] = React.useState<string>('/settings#account');
  const [primaryLabel, setPrimaryLabel] = React.useState<string>('Sign in');
  const [promptKind, setPromptKind] = React.useState<AuthPromptKind>('signin');

  // Beta invite code state
  const [betaMode, setBetaMode] = React.useState(false);
  const [betaStep, setBetaStep] = React.useState<'code' | 'done'>('code');
  const [inviteCode, setInviteCode] = React.useState('');
  const [codeError, setCodeError] = React.useState<string | null>(null);
  const [codeBusy, setCodeBusy] = React.useState(false);

  const navigate = useNavigate();

  // Fetch beta status on mount
  React.useEffect(() => {
    fetchBetaStatus().then(setBetaMode);
  }, []);

  const requireAuth = React.useCallback((opts?: AuthPromptOptions) => {
    const kind: AuthPromptKind = opts?.kind ?? 'signin';

    const defaultTitle =
      kind === 'verify_email' ? 'Verify your email' : 'Sign in required';

    const defaultMessage =
      kind === 'verify_email'
        ? 'You need to verify your email address before using this feature. Go to Settings → Account to resend the verification link.'
        : 'You need an account to use this feature. Sign in or create one for free.';

    const defaultPrimaryLabel =
      kind === 'verify_email' ? 'Go to account' : 'Sign in';

    setTitle(opts?.title ?? defaultTitle);
    setMessage(opts?.message ?? defaultMessage);
    setRedirectTo(opts?.redirectTo ?? '/settings#account');
    setPrimaryLabel(opts?.primaryLabel ?? defaultPrimaryLabel);
    setPromptKind(kind);

    // Reset beta state
    setBetaStep('code');
    setInviteCode('');
    setCodeError(null);

    setOpen(true);
  }, []);

  const onClose = () => {
    setOpen(false);
    setInviteCode('');
    setCodeError(null);
    setBetaStep('code');
  };

  const onGoToAuth = () => {
    setOpen(false);
    navigate(sanitizePostAuthRedirect(redirectTo));
  };

  async function handleVerifyCode() {
    const trimmed = inviteCode.trim();
    if (!trimmed) {
      setCodeError('Please enter an invite code.');
      return;
    }
    try {
      setCodeBusy(true);
      setCodeError(null);
      const res = await fetch(`${API_BASE}/api/auth/verify-invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: trimmed }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const err = data?.error;
        if (err === 'INVALID_CODE') {
          setCodeError('This code is invalid. Check your invite and try again.');
        } else if (err === 'EXPIRED_CODE') {
          setCodeError('This code has expired.');
        } else if (err === 'CODE_FULL') {
          setCodeError('This code has reached its maximum number of uses.');
        } else {
          setCodeError('Invalid code. Please try again.');
        }
        return;
      }

      // Code is valid – store it for the signup form
      localStorage.setItem('epion_invite_code', trimmed.toUpperCase());
      setBetaStep('done');
    } catch {
      setCodeError('Connection error. Please try again.');
    } finally {
      setCodeBusy(false);
    }
  }

  // Determine what to render in the modal
  const showBetaGate = betaMode && promptKind === 'signin';

  return (
    <AuthPromptContext.Provider value={{ requireAuth }}>
      {children}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <div
            className="
              w-full max-w-sm mx-4
              rounded-2xl border border-white/10
              bg-gradient-to-b from-neutral-900 to-neutral-950
              p-6 shadow-2xl shadow-black/40
              animate-in fade-in zoom-in-95 duration-200
            "
            style={{ animation: 'popIn 0.2s ease-out' }}
          >
            {/* ─── Beta Gate: Step 1 — Enter Code ─── */}
            {showBetaGate && betaStep === 'code' && (
              <>
                {/* Beta badge */}
                <div className="flex items-center gap-2 mb-4">
                  <span className="
                    inline-flex items-center gap-1
                    rounded-full bg-gradient-to-r from-violet-600 to-indigo-600
                    px-3 py-1 text-xs font-semibold text-white
                    shadow-lg shadow-violet-500/25
                  ">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
                    BETA
                  </span>
                </div>

                <h3 className="text-lg font-bold text-white">
                  Welcome to Epion Beta
                </h3>
                <p className="mt-2 text-sm text-neutral-400 leading-relaxed">
                  Epion is currently in closed beta. Enter your invite code below to create an account and unlock full access.
                </p>

                <div className="mt-5">
                  <label className="block text-xs font-medium text-neutral-400 mb-1.5">
                    Invite Code
                  </label>
                  <input
                    type="text"
                    value={inviteCode}
                    onChange={(e) => {
                      setInviteCode(e.target.value.toUpperCase());
                      setCodeError(null);
                    }}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleVerifyCode(); }}
                    placeholder="XXXX-XXXX"
                    autoFocus
                    className={`
                      w-full rounded-xl border bg-neutral-800/60
                      px-4 py-3 text-sm text-white font-mono tracking-wider
                      placeholder:text-neutral-600
                      outline-none transition-all duration-200
                      focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500
                      ${codeError
                        ? 'border-red-500/60 focus:ring-red-500/30'
                        : 'border-neutral-700/50'
                      }
                    `}
                  />
                  {codeError && (
                    <p className="mt-2 text-xs text-red-400 flex items-center gap-1">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                      {codeError}
                    </p>
                  )}
                </div>

                <div className="mt-5 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="
                      rounded-xl border border-neutral-700/50 px-4 py-2 text-sm text-neutral-400
                      hover:bg-neutral-800/60 transition-colors
                    "
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleVerifyCode}
                    disabled={codeBusy || !inviteCode.trim()}
                    className="
                      rounded-xl px-5 py-2 text-sm font-semibold text-white
                      bg-gradient-to-r from-violet-600 to-indigo-600
                      hover:from-violet-500 hover:to-indigo-500
                      disabled:opacity-40 disabled:cursor-not-allowed
                      transition-all shadow-lg shadow-violet-600/20
                    "
                  >
                    {codeBusy ? (
                      <span className="flex items-center gap-2">
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                        Verifying…
                      </span>
                    ) : 'Validate'}
                  </button>
                </div>

                <p className="mt-4 text-[11px] text-neutral-600 text-center">
                  Don't have a code? Follow us on social media for beta access.
                </p>
              </>
            )}

            {/* ─── Beta Gate: Step 2 — Success ─── */}
            {showBetaGate && betaStep === 'done' && (
              <>
                <div className="text-center">
                  <div className="
                    mx-auto mb-4 flex h-14 w-14 items-center justify-center
                    rounded-full bg-gradient-to-br from-emerald-500 to-green-600
                    shadow-lg shadow-emerald-500/30
                  ">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                  </div>
                  <h3 className="text-lg font-bold text-white">
                    Code accepted!
                  </h3>
                  <p className="mt-2 text-sm text-neutral-400">
                    Your invite code is valid. Create your account to start using Epion.
                  </p>
                </div>

                <div className="mt-6 flex justify-center">
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      navigate('/settings#account');
                    }}
                    className="
                      rounded-xl px-6 py-2.5 text-sm font-semibold text-white
                      bg-gradient-to-r from-violet-600 to-indigo-600
                      hover:from-violet-500 hover:to-indigo-500
                      transition-all shadow-lg shadow-violet-600/20
                    "
                  >
                    Create account →
                  </button>
                </div>
              </>
            )}

            {/* ─── Non-beta / verify_email: Original prompt ─── */}
            {!showBetaGate && (
              <>
                <h3 className="text-base font-semibold text-white">{title}</h3>
                <p className="mt-2 text-sm text-neutral-400">{message}</p>
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-xl border border-neutral-700/50 px-3 py-1.5 text-sm text-neutral-400 hover:bg-neutral-800/60 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={onGoToAuth}
                    className="rounded-xl bg-white px-4 py-1.5 text-sm font-semibold text-black hover:bg-neutral-200 transition-colors"
                  >
                    {primaryLabel}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Keyframe animation */}
      <style>{`
        @keyframes popIn {
          from {
            opacity: 0;
            transform: scale(0.95) translateY(10px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
      `}</style>
    </AuthPromptContext.Provider>
  );
}
