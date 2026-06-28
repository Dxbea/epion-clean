export type AuthUser = {
  id?: string;
  email?: string;
  name?: string | null;
  displayName?: string | null;
  username?: string | null;
  phone?: string | null;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  bio?: string | null;
  role?: string | null;
  emailVerified?: boolean;
  createdAt?: string;
  followersCount?: number;
  followingCount?: number;
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
