// src/contexts/MeContext.tsx
import * as React from 'react'
import { API_BASE } from '@/config/api'

/**
 * Shape utilisateur global – doit matcher ce que renvoie GET /api/me
 */
export type Me = {
  id: string
  email: string
  emailVerifiedAt: string | null
  displayName: string
  username: string
  phone: string | null
  avatarUrl: string | null
  role: string
}

type MeCtxShape = {
  me: Me | null
  loading: boolean

  refresh: () => Promise<void>

  login: (email: string, password: string) => Promise<void>
  signup: (email: string, password: string, displayName: string) => Promise<void>
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
      emailVerifiedAt: raw.emailVerifiedAt ?? null,
      displayName: raw.displayName ?? raw.name ?? '',
      username: raw.username ?? '',
      phone: raw.phone ?? null,
      avatarUrl: raw.avatarUrl ?? null,
      role: raw.role ?? 'USER',
    }

    return data
  } catch {
    return null
  }
}

export function MeProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = React.useState<Me | null>(null)
  const [loading, setLoading] = React.useState(true)

  // au montage : charge /api/me
  React.useEffect(() => {
    let alive = true

    ;(async () => {
      setLoading(true)
      const data = await fetchFullMe()
      if (!alive) return
      setMe(data)
      setLoading(false)
    })()

    return () => {
      alive = false
    }
  }, [])

  const refresh = React.useCallback(async () => {
    setLoading(true)
    const data = await fetchFullMe()
    setMe(data)
    setLoading(false)
  }, [])

  const login = React.useCallback(
    async (email: string, password: string) => {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      if (!res.ok) {
        const text = await res.text().catch(() => `HTTP ${res.status}`)
        throw new Error(text || `HTTP ${res.status}`)
      }

      await refresh()
    },
    [refresh],
  )

  const signup = React.useCallback(
    async (email: string, password: string, displayName: string) => {
      const res = await fetch(`${API_BASE}/api/auth/signup`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, displayName }),
      })

      if (!res.ok) {
        const text = await res.text().catch(() => `HTTP ${res.status}`)
        throw new Error(text || `HTTP ${res.status}`)
      }

      await refresh()
    },
    [refresh],
  )

  const logout = React.useCallback(async () => {
    try {
      await fetch(`${API_BASE}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      })
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
