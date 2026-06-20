import React from 'react'
import FormSection from '@/components/settings/FormSection'
import Button from '@/components/ui/Button'
import { useI18n } from '@/i18n/I18nContext'
import { useToast } from '@/components/ui/Toast'
import { THEME_STORAGE_KEY } from '@/hooks/useTheme'
import { downloadUserDataExport } from '@/api/userDataExport'




export default function DataComplianceSection({ id }: { id?: string }){
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
    ;['account','notif','privacy','lang','epion_lang_pref','sessions', THEME_STORAGE_KEY, 'a11y', 'theme'].forEach(k => localStorage.removeItem(k))
    alert(t('deleted_local'))
    push(t?.('deleted_local') ?? 'Local data deleted.', 'success')

  }

  return (
    <FormSection id={id} title={t('data')} description={t('data_desc')}>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" onClick={exportData}>{t('export_json')}</Button>
        <Button variant="destructive" onClick={deleteAccount}>{t('delete_account')}</Button>
      </div>
    </FormSection>
  )
}
