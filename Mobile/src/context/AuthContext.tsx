import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import {
  getMe,
  getSession,
  getUserFromSession,
  signInEmail,
  signOut as requestSignOut,
} from '@/lib/auth';
import type { AuthUser } from '@/types/user';

type RefreshSessionResult = {
  user: AuthUser | null;
  sessionStatus: number | null;
  meStatus: number | null;
  hasCookieHeader: boolean;
  hasSession: boolean;
};

type SignInResult = RefreshSessionResult & {
  loginStatus: number | null;
  ok: boolean;
  loginCookieReceived: boolean;
  errorMessage?: string;
};

type SignOutResult = RefreshSessionResult & {
  logoutStatus: number | null;
  ok: boolean;
};

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<SignInResult>;
  signOut: () => Promise<SignOutResult>;
  refreshSession: () => Promise<RefreshSessionResult>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(false);

  const refreshSession = useCallback(async (): Promise<RefreshSessionResult> => {
    setLoading(true);

    try {
      const session = await getSession();
      const sessionUser = getUserFromSession(session.data);

      if (!session.data) {
        setUser(null);
        return {
          user: null,
          sessionStatus: session.status,
          meStatus: null,
          hasCookieHeader: session.hasCookieHeader,
          hasSession: false,
        };
      }

      const me = await getMe();
      const nextUser = me.data ?? sessionUser;
      setUser(nextUser);

      return {
        user: nextUser,
        sessionStatus: session.status,
        meStatus: me.status,
        hasCookieHeader: session.hasCookieHeader,
        hasSession: true,
      };
    } finally {
      setLoading(false);
    }
  }, []);

  const signIn = useCallback(
    async (email: string, password: string): Promise<SignInResult> => {
      setLoading(true);

      try {
        const login = await signInEmail(email, password);

        if (!login.ok) {
          setUser(null);
          return {
            user: null,
            sessionStatus: null,
            meStatus: null,
            hasCookieHeader: false,
            hasSession: false,
            loginStatus: login.status,
            ok: false,
            loginCookieReceived: login.hasCookieHeader,
            errorMessage: login.errorMessage,
          };
        }

        const session = await refreshSession();

        return {
          ...session,
          loginStatus: login.status,
          ok: true,
          loginCookieReceived: login.hasCookieHeader,
        };
      } finally {
        setLoading(false);
      }
    },
    [refreshSession],
  );

  const signOut = useCallback(async (): Promise<SignOutResult> => {
    setLoading(true);

    try {
      const logout = await requestSignOut();
      setUser(null);
      const session = await refreshSession();
      const meStatus = session.hasSession ? session.meStatus : (await getMe()).status;

      return {
        ...session,
        meStatus,
        logoutStatus: logout.status,
        ok: logout.ok,
      };
    } finally {
      setLoading(false);
    }
  }, [refreshSession]);


  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      signIn,
      signOut,
      refreshSession,
    }),
    [loading, refreshSession, signIn, signOut, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }

  return context;
}



