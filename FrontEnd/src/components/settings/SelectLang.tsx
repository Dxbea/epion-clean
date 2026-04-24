// src/components/settings/SelectLang.tsx
import React from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { useI18n } from '@/i18n/I18nContext'

type Lang = 'fr' | 'en' | 'system'

type Props = {
  value?: Lang
  onChange?: (l: Lang) => void
  className?: string
}

export default function SelectLang({ value, onChange, className = '' }: Props) {
  const { locale, setLocale, t } = useI18n()
  const current = (value ?? locale) as Lang
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)

  const options: Array<{ value: Lang; label: string }> = [
    { value: 'system', label: t?.('lang_auto') || 'Auto' },
    { value: 'fr', label: t?.('lang_fr') || 'Francais' },
    { value: 'en', label: t?.('lang_en') || 'English' },
  ]

  const selected = options.find((option) => option.value === current) ?? options[0]

  React.useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [])

  function selectLanguage(lang: Lang) {
    onChange?.(lang)
    if (!onChange) setLocale(lang)
    if (lang === 'system') {
      localStorage.removeItem('epion_lang_pref')
    } else {
      localStorage.setItem('epion_lang_pref', lang)
    }
    setOpen(false)
  }

  return (
    <div ref={ref} className={`relative inline-block min-w-40 ${className}`}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-[40px] w-full items-center justify-between gap-3 rounded-xl border border-black/10 bg-white px-3 py-2 text-left text-sm text-neutral-900 shadow-sm transition hover:border-black/20 hover:bg-neutral-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue dark:border-white/10 dark:bg-neutral-950 dark:text-neutral-100 dark:hover:border-white/20 dark:hover:bg-neutral-900"
      >
        <span className="truncate">{selected.label}</span>
        <ChevronDown
          aria-hidden="true"
          size={16}
          className={`shrink-0 text-neutral-500 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-full z-50 mt-2 w-full overflow-hidden rounded-xl border border-black/10 bg-white p-1 shadow-[0_16px_40px_rgba(15,23,42,0.16)] dark:border-white/10 dark:bg-neutral-950"
        >
          {options.map((option) => {
            const active = option.value === current

            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => selectLanguage(option.value)}
                className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition ${
                  active
                    ? 'bg-black text-white dark:bg-white dark:text-black'
                    : 'text-neutral-800 hover:bg-black/5 dark:text-neutral-100 dark:hover:bg-white/10'
                }`}
              >
                <span>{option.label}</span>
                {active ? <Check aria-hidden="true" size={15} /> : null}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
