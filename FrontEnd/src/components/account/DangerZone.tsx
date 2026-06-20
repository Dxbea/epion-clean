import React from 'react'
import FormSection from '@/components/settings/FormSection'
import Button from '@/components/ui/Button'
import { useI18n } from '@/i18n/I18nContext'
import { THEME_STORAGE_KEY } from '@/hooks/useTheme'
import { downloadUserDataExport } from '@/api/userDataExport'
import { useToast } from '@/components/ui/Toast'


export default function DangerZone(){
  const { t } = useI18n()
  const { push } = useToast()

  async function exportData(){
    try {
      await downloadUserDataExport()
      push(t?.('export_done') ?? 'JSON export ready.', 'success')
    } catch {
      push(t?.('export_failed') ?? 'Export failed.', 'error')
    }
  }

  function deleteAccount(){
    if (!confirm(t('delete_confirm'))) return
    ;['account','notif','privacy','lang', 'epion_lang_pref', 'sessions', THEME_STORAGE_KEY, 'a11y', 'theme'].forEach(k => localStorage.removeItem(k))
    alert(t('deleted_local'))
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
