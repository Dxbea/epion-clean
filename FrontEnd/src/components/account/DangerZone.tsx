import React from 'react'
import { useNavigate } from 'react-router-dom'
import FormSection from '@/components/settings/FormSection'
import Button from '@/components/ui/Button'
import { useI18n } from '@/i18n/I18nContext'
import { THEME_STORAGE_KEY } from '@/hooks/useTheme'
import { apiDeleteAccount } from '@/api/auth'
import { useMe } from '@/contexts/MeContext'

function download(filename: string, text: string){
  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

function accountDeletionErrorMessage(error: unknown, t: (key: string) => string){
  const message = error instanceof Error ? error.message : ''
  if (message === 'OAUTH_ACCOUNT_DELETION_REQUIRES_EMAIL_TOKEN') return t('delete_account_oauth_blocked')
  return message || t('delete_account_failed')
}

function clearLocalAccountState(){
  ;['account','notif','privacy','lang', 'epion_lang_pref', 'sessions', THEME_STORAGE_KEY, 'a11y', 'theme'].forEach(k => localStorage.removeItem(k))
}

export default function DangerZone(){
  const { t } = useI18n()
  const { me, logout } = useMe()
  const navigate = useNavigate()

  function exportData(){
    const data = {
      account: JSON.parse(localStorage.getItem('account') || 'null'),
      notif: JSON.parse(localStorage.getItem('notif') || 'null'),
      privacy: JSON.parse(localStorage.getItem('privacy') || 'null'),
      lang: localStorage.getItem('epion_lang_pref') || null,
      sessions: JSON.parse(localStorage.getItem('sessions') || 'null'),
      theme: localStorage.getItem(THEME_STORAGE_KEY) || null,
      a11y: JSON.parse(localStorage.getItem('a11y') || 'null'),
      exportedAt: new Date().toISOString(),
    }
    download('epion-export.json', JSON.stringify(data, null, 2))
  }

  async function deleteAccount(){
    if (!me?.email) return
    if (!confirm(t('delete_confirm_server'))) return

    const confirmationEmail = prompt(t('delete_confirm_email_prompt'))?.trim()
    if (!confirmationEmail) return

    const password = prompt(t('delete_password_prompt'))?.trim() || undefined

    try {
      await apiDeleteAccount({ confirmationEmail, password })
      clearLocalAccountState()
      await logout()
      navigate('/', { replace: true })
    } catch (error) {
      alert(accountDeletionErrorMessage(error, t))
    }
  }

  return (
    <FormSection title={t('danger_zone')} description={t('danger_zone_desc')}>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" onClick={exportData}>{t('export_json')}</Button>
        <Button variant="destructive" onClick={deleteAccount}>{t('delete_account')}</Button>
      </div>
    </FormSection>
  )
}
