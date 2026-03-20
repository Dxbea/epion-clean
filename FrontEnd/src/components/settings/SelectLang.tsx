// src/components/settings/SelectLang.tsx
import React from 'react'
import { useI18n } from '@/i18n/I18nContext'

type Lang = 'fr' | 'en' | 'system'

type Props = {
  value?: Lang                 // optionnel : si tu veux le contrôler depuis Settings
  onChange?: (l: Lang) => void // optionnel
  className?: string
}

export default function SelectLang({ value, onChange, className = '' }: Props) {
  const { locale, setLocale, t } = useI18n()
  const current = value ?? locale

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const l = e.target.value as Lang
    onChange?.(l)          
    if (!onChange) setLocale(l)
    if (l === 'system') {
      localStorage.removeItem('epion_lang_pref')
    } else {
      localStorage.setItem('epion_lang_pref', l)
    }
  }

  return (
    <div className={`inline-flex items-center gap-2 rounded-xl border border-surface-200 bg-white p-2 dark:border-neutral-800 dark:bg-neutral-950 ${className}`}>
      <label htmlFor="lang" className="sr-only">Language</label>
      <select
        id="lang"
        className="rounded-lg bg-transparent px-2 py-1 text-sm outline-none"
        value={current}
        onChange={handleChange}
      >
        <option value="system">{t?.('lang_auto') || 'Auto'}</option>
        <option value="fr">{t?.('lang_fr') || 'Français'}</option>
        <option value="en">{t?.('lang_en') || 'English'}</option>
      </select>
    </div>
  )
}
