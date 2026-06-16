// src/contexts/MeContext.tsx
import * as React from 'react'
import { API_BASE } from '@/config/api'
import { authClient, getEmailVerificationCallbackURL } from '@/lib/better-auth-client'
import { clearStoredAuthRedirects } from '@/lib/auth-navigation'

/**
 * Shape utilisateur global – doit matcher ce que renvoie GET /api/me
 */
export type Me = {
  id: string
  email: string
  emailVerified: boolean
  displayName: string
  username: string
  phone: string | null
  avatarUrl: string | null
  bannerUrl: string | null
  role: string
  bio: string | null
  followersCount: number
  followingCount: number
}

type MeCtxShape = {
  me: Me | null
  loading: boolean

  refresh: () => Promise<void>

  login: (email: string, password: string) => Promise<void>
  signup: (email: string, password: string, displayName: string, inviteCode?: string) => Promise<void>
  logout: () => Promise<void>

  updateLocal: (patch: Partial<Me>) => void
}

const MeCtx = React.createContext<MeCtxShape | null>(null)

/**
 * Récupère le profil complet depuis /api/me
 */

async function fetchFullMe(): Promise<Me | null> {
  try {
    const res = await fetch(`${API_BASE}/api/me?t=${Date.now()}`, {
      credentials: 'include',
      cache: 'no-store',
    })
    if (res.status === 401) return null
    if (!res.ok) return null

    const raw = await res.json()

    const data: Me = {
      id: raw.id,
      email: raw.email,
      emailVerified: Boolean(raw.emailVerified),
      displayName: raw.displayName ?? raw.name ?? '',
      username: raw.username ?? '',
      phone: raw.phone ?? null,
      avatarUrl: raw.avatarUrl ?? null,
      bannerUrl: raw.bannerUrl ?? null,
      role: raw.role ?? 'USER',
      bio: raw.bio ?? null,
      followersCount: raw.followersCount ?? 0,
      followingCount: raw.followingCount ?? 0,
    }

    return data
  } catch {
    return null
  }
}

export function MeProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = React.useState<Me | null>(null)
  const [loading, setLoading] = React.useState(true)

  const refresh = React.useCallback(async () => {
    setLoading(true)
    try {
      const session = await authClient.getSession({
        query: {
          disableCookieCache: true,
        },
      })
      if (session.error || !session.data) {
        setMe(null)
        return
      }

      const data = await fetchFullMe()
      setMe(data)
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  const login = React.useCallback(
    async (email: string, password: string) => {
      const res = await authClient.signIn.email({
        email,
        password,
      })

      if (res.error) {
        const code = String((res.error as { code?: string }).code || res.error.message || '')
        if (res.error.status === 403 || code.includes('EMAIL_NOT_VERIFIED') || code.includes('Email not verified')) {
          throw new Error('EMAIL_NOT_VERIFIED')
        }
        const status = res.error.status ? `HTTP ${res.error.status}` : 'HTTP 401'
        throw new Error(`${status} ${res.error.message || ''}`.trim())
      }

      await refresh()
      clearStoredAuthRedirects()
    },
    [refresh],
  )

  const signup = React.useCallback(
    async (email: string, password: string, displayName: string, inviteCode?: string) => {
      const username = displayName.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 20)
      const res = await authClient.signUp.email({
        email,
        password,
        name: displayName,
        username,
        callbackURL: getEmailVerificationCallbackURL(),
        ...(inviteCode ? { inviteCode } : {}),
      })

      if (res.error) {
        const status = res.error.status ? `HTTP ${res.error.status}` : 'HTTP 400'
        throw new Error(`${status} ${res.error.message || ''}`.trim())
      }

      await refresh()
    },
    [refresh],
  )

  const logout = React.useCallback(async () => {
    try {
      await authClient.signOut()
    } catch {
      // ignore
    }
    setMe(null)
    setLoading(false)
  }, [])

  const updateLocal = React.useCallback((patch: Partial<Me>) => {
    setMe(prev => (prev ? { ...prev, ...patch } : prev))
  }, [])

  const value = React.useMemo(
    () => ({
      me,
      loading,
      refresh,
      login,
      signup,
      logout,
      updateLocal,
    }),
    [me, loading, refresh, login, signup, logout, updateLocal],
  )

  return <MeCtx.Provider value={value}>{children}</MeCtx.Provider>
}

export function useMe(): MeCtxShape {
  const ctx = React.useContext(MeCtx)
  if (!ctx) {
    throw new Error('useMe must be used inside <MeProvider>')
  }
  return ctx
}
