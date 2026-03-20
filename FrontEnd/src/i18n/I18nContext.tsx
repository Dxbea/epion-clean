import React from 'react'
import { useTranslation } from 'react-i18next'

type Locale = 'fr' | 'en' | 'system'
type Ctx = {
  locale: 'fr' | 'en' // This is the RESOLVED locale for the UI
  preference: Locale  // This is the USER'S choice ('fr' | 'en' | 'system')
  t: (key: string) => string
  setLocale: (l: Locale) => void
}

const I18nContext = React.createContext<Ctx | undefined>(undefined)

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const { t, i18n } = useTranslation()

  // The resolved locale for the UI (never 'system')
  const locale = (i18n.language.startsWith('fr') ? 'fr' : 'en') as 'fr' | 'en'
  const preference = (localStorage.getItem('epion_lang_pref') || 'system') as Locale

  const setLocale = React.useCallback((l: Locale) => {
    if (l === 'system') {
      localStorage.removeItem('epion_lang_pref')
      // To re-trigger detection, we might need to reload or manually detect
      // But i18next-browser-languagedetector usually handles it on reload.
      // For immediate effect:
      i18n.changeLanguage(navigator.language)
    } else {
      i18n.changeLanguage(l)
    }
  }, [i18n])

  const value = React.useMemo<Ctx>(() => ({
    locale,
    preference,
    t: (keyPath: string) => t(keyPath),
    setLocale
  }), [locale, preference, t, setLocale])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const ctx = React.useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>')
  return ctx
}
