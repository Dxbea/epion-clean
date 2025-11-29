import React from 'react'
import { DICT } from './dict' // .js OK grâce à allowJs

type Locale = 'fr' | 'en'
type Ctx = {
  locale: Locale
  t: (key: string) => string
  setLocale: (l: Locale) => void   // ✅ exposé dans le type
}

const I18nContext = React.createContext<Ctx | undefined>(undefined)

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = React.useState<Locale>(() => {
    const stored = localStorage.getItem('lang') as Locale | null
    return stored ?? 'fr'
  })

  // persistance + re-render auto
  React.useEffect(() => {
    localStorage.setItem('lang', locale)
  }, [locale])

  const t = React.useCallback((key: string) => {
    // fallback: fr -> en -> clé
    return (DICT as any)[locale]?.[key] ?? (DICT as any).en?.[key] ?? key
  }, [locale])

  const value = React.useMemo<Ctx>(() => ({ locale, t, setLocale }), [locale, t])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const ctx = React.useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>')
  return ctx
}
