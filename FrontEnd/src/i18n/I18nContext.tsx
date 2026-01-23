import React from 'react'
import { useTranslation } from 'react-i18next'

type Locale = 'fr' | 'en'
type Ctx = {
  locale: Locale
  t: (key: string) => string
  setLocale: (l: Locale) => void
}

const I18nContext = React.createContext<Ctx | undefined>(undefined)

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const { t, i18n } = useTranslation()

  const locale = (i18n.language.startsWith('en') ? 'en' : 'fr') as Locale

  const setLocale = React.useCallback((l: Locale) => {
    i18n.changeLanguage(l)
  }, [i18n])

  const value = React.useMemo<Ctx>(() => ({
    locale,
    t: (keyPath: string) => t(keyPath),
    setLocale
  }), [locale, t, setLocale])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const ctx = React.useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>')
  return ctx
}
