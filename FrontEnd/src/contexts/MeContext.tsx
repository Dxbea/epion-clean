// src/contexts/MeContext.tsx
import * as React from 'react'
import { API_BASE } from '@/config/api'
import { authClient } from '@/lib/better-auth-client'

/**
 * Shape utilisateur global – doit matcher ce que renvoie GET /api/me
 */
export type Me = {
  id: string
  email: string
  emailVerified: boolean
  emailVerifiedAt: string | null
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
      emailVerified: Boolean(raw.emailVerified ?? raw.emailVerifiedAt),
      emailVerifiedAt: raw.emailVerifiedAt ?? null,
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
        const status = res.error.status ? `HTTP ${res.error.status}` : 'HTTP 401'
        throw new Error(`${status} ${res.error.message || ''}`.trim())
      }

      await refresh()
    },
    [refresh],
  )

  const signup = React.useCallback(
    async (email: string, password: string, displayName: string, inviteCode?: string) => {
      const res = await fetch(`${API_BASE}/api/auth/signup`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, displayName, ...(inviteCode ? { inviteCode } : {}) }),
      })

      if (!res.ok) {
        const text = await res.text().catch(() => `HTTP ${res.status}`)
        throw new Error(`HTTP ${res.status} ${text || ''}`.trim())
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
