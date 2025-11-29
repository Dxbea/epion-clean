import React from 'react'
import FormSection from '@/components/settings/FormSection'
import Button from '@/components/ui/Button'
import { useI18n } from '@/i18n/I18nContext'
import { useToast } from '@/components/ui/Toast'



function download(filename: string, text: string){
  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

export default function DataComplianceSection({ id }: { id?: string }){
  const { t } = useI18n()
  const { push } = useToast()



  function exportData(){
    const data = {
      account: JSON.parse(localStorage.getItem('account') || 'null'),
      notif: JSON.parse(localStorage.getItem('notif') || 'null'),
      privacy: JSON.parse(localStorage.getItem('privacy') || 'null'),
      lang: localStorage.getItem('lang') || null,
      sessions: JSON.parse(localStorage.getItem('sessions') || 'null'),
      theme: localStorage.getItem('theme') || null,
      a11y: JSON.parse(localStorage.getItem('a11y') || 'null'),
      exportedAt: new Date().toISOString(),
    }
    download('epion-export.json', JSON.stringify(data, null, 2))
    push(t?.('export_done') ?? 'JSON export ready.', 'success')
  }

  function deleteAccount(){
    if (!confirm(t('delete_confirm'))) return
    ;['account','notif','privacy','lang','sessions','theme','a11y'].forEach(k => localStorage.removeItem(k))
    alert(t('deleted_local'))
    push(t?.('deleted_local') ?? 'Local data deleted.', 'success')

  }

  return (
    <FormSection id={id} title={t('data')} description={t('data_desc')}>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" onClick={exportData}>{t('export_json')}</Button>
        <Button variant="primary" onClick={deleteAccount}>{t('delete_account')}</Button>
      </div>
    </FormSection>
  )
}