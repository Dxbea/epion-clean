export type AuthUser = {
  id?: string;
  email?: string;
  name?: string;
  displayName?: string;
  username?: string;
};

export type AuthSessionResult = {
  data: unknown;
  status: number | null;
  hasCookieHeader: boolean;
};

export type AuthMeResult = {
  data: AuthUser | null;
  status: number | null;
};

export type AuthSignInResult = {
  data: unknown;
  status: number | null;
  ok: boolean;
  hasCookieHeader: boolean;
  errorMessage?: string;
};

export type AuthSignOutResult = {
  status: number | null;
  ok: boolean;
};
