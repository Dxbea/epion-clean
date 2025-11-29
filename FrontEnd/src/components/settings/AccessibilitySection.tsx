import React from 'react'
import FormSection from '@/components/settings/FormSection'
import ToggleRow from '@/components/settings/ToggleRow'
import { useI18n } from '@/i18n/I18nContext'

export type A11yState = { textLg: boolean; contrast: boolean }

export default function AccessibilitySection({ id }: { id?: string }){
  const { t } = useI18n()
  const [state, setState] = React.useState<A11yState>(() => {
    const raw = localStorage.getItem('a11y')
    return raw ? JSON.parse(raw) as A11yState : { textLg: false, contrast: false }
  })

  React.useEffect(() => {
    const root = document.documentElement
    state.textLg ? root.classList.add('a11y-text-lg') : root.classList.remove('a11y-text-lg')
    state.contrast ? root.classList.add('a11y-contrast') : root.classList.remove('a11y-contrast')
    localStorage.setItem('a11y', JSON.stringify(state))
  }, [state])

  return (
    <FormSection id={id} title={t('accessibility')} description={t('accessibility_desc')}>
      <div className="space-y-4">
        <ToggleRow label={t('a11y_larger_text')} sublabel={t('a11y_larger_text_desc')} value={state.textLg} onChange={(v: boolean)=>setState(s=>({...s, textLg:v}))} />
        <ToggleRow label={t('a11y_higher_contrast')} sublabel={t('a11y_higher_contrast_desc')} value={state.contrast} onChange={(v: boolean)=>setState(s=>({...s, contrast:v}))} />
      </div>
    </FormSection>
  )}
