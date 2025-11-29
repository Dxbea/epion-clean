// FrontEnd/src/contexts/AuthPromptContext.tsx
import * as React from 'react';
import { useNavigate } from 'react-router-dom';

type AuthPromptOptions = {
  title?: string;
  message?: string;
  redirectTo?: string;
  primaryLabel?: string;
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
    setTitle(opts?.title ?? 'Sign in required');
    setMessage(
      opts?.message ??
        'You need an account to use this feature. Sign in or create one for free.',
    );
    setRedirectTo(opts?.redirectTo ?? '/settings#account');
    setPrimaryLabel(opts?.primaryLabel ?? 'Sign in');
    setOpen(true);
  }, []);

  const onClose = () => setOpen(false);

  const onGoToAuth = () => {
    setOpen(false);
    navigate(redirectTo);
  };

  return (
    <AuthPromptContext.Provider value={{ requireAuth }}>
      {children}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-black/10 bg-white p-5 shadow-xl dark:border-white/10 dark:bg-neutral-950">
            <h3 className="text-base font-semibold">{title}</h3>
            <p className="mt-2 text-sm opacity-80">{message}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border px-3 py-1.5 text-sm hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onGoToAuth}
                className="rounded-full bg-black px-4 py-1.5 text-sm text-white dark:bg-white dark:text-black"
              >
                {primaryLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </AuthPromptContext.Provider>
  );
}
