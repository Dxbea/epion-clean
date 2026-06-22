// FrontEnd/src/contexts/AuthPromptContext.tsx
import * as React from 'react';
import { useNavigate } from 'react-router-dom';
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

export function AuthPromptProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState<string>('Sign in required');
  const [message, setMessage] = React.useState<string>('');
  const [redirectTo, setRedirectTo] = React.useState<string>('/settings#account');
  const [primaryLabel, setPrimaryLabel] = React.useState<string>('Sign in');

  const navigate = useNavigate();

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

    setOpen(true);
  }, []);

  const onClose = () => {
    setOpen(false);
  };

  const onGoToAuth = () => {
    setOpen(false);
    navigate(sanitizePostAuthRedirect(redirectTo));
  };

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
