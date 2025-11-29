// src/components/settings/SessionsList.tsx
import * as React from 'react'
import FormSection from '@/components/settings/FormSection'
import Button from '@/components/ui/Button'
import { useI18n } from '@/i18n/I18nContext'
import { API_BASE } from '@/config/api'
import { useToast } from '@/components/ui/Toast'

type Session = { id: string; createdAt: string; expiresAt: string | null; current: boolean }

export default function SessionsList({ id }: { id?: string }) {
  const { t } = useI18n()
  const { push } = useToast()
  const [loading, setLoading] = React.useState(true)
  const [list, setList] = React.useState<Session[]>([])
  const [busyAll, setBusyAll] = React.useState(false)
  const [refreshing, setRefreshing] = React.useState(false)

  async function fetchList(silent = false) {
    try {
      if (!silent) setLoading(true)
      const res = await fetch(`${API_BASE}/api/auth/sessions`, { credentials: 'include' })
      if (!res.ok) throw new Error('HTTP ' + res.status)
      const json = await res.json()
      setList(json.sessions as Session[])
    } catch {
      push('Failed to load sessions', 'error')
    } finally {
      if (!silent) setLoading(false)
    }
  }

  React.useEffect(() => { fetchList() }, [])

  async function revokeOne(id: string) {
    const prev = list
    setList(prev.filter(s => s.id !== id))
    try {
      const res = await fetch(`${API_BASE}/api/auth/sessions/${id}`, {
        method: 'DELETE', credentials: 'include'
      })
      if (!res.ok) throw new Error('HTTP ' + res.status)
      push(t('saved'), 'success')
    } catch {
      setList(prev) // rollback
      push('Failed to revoke', 'error')
    }
  }

  async function revokeOthers() {
    try {
      setBusyAll(true)
      const res = await fetch(`${API_BASE}/api/auth/sessions/others`, {
        method: 'DELETE', credentials: 'include'
      })
      if (!res.ok) throw new Error('HTTP ' + res.status)
      const { deleted } = await res.json()
      await fetchList(true)
      push(deleted > 0 ? t('revoke_all_done') : t('no_other_sessions'), 'success')
    } catch {
      push(t('revoke_all_failed'), 'error')
    } finally {
      setBusyAll(false)
    }
  }

  async function onRefresh() {
    try {
      setRefreshing(true)
      await fetchList(true)
      push(t('sessions_refreshed'), 'success')
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <FormSection
      id={id}
      title={t('sessions')}
      description={t('sessions_desc')}
      footer={
        <div className="flex items-center gap-3">
          <Button onClick={onRefresh} variant="ghost" disabled={refreshing}>
            {refreshing ? '…' : t('sessions_refresh')}
          </Button>
          <Button onClick={revokeOthers} variant="primary" disabled={busyAll}>
            {busyAll ? '…' : t('revoke_all_others_btn')}
          </Button>
        </div>
      }
    >
      {loading ? (
        <div className="text-sm opacity-70">Loading…</div>
      ) : (
        <ul className="divide-y divide-surface-200 dark:divide-neutral-800">
          {list.map(s => (
            <li key={s.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <div className="text-sm font-medium">
                  {s.current ? t('this_device') : 'Session'}
                </div>
                <div className="text-xs opacity-70">
                  {t('last_active')}: {new Date(s.createdAt).toLocaleString()}
                </div>
              </div>
              <div className="shrink-0">
                {s.current ? (
                  <span className="chip">{t('this_device')}</span>
                ) : (
                  <Button variant="ghost" onClick={() => revokeOne(s.id)}>
                    {t('revoke')}
                  </Button>
                )}
              </div>
            </li>
          ))}
          {list.filter(s => !s.current).length === 0 && (
            <li className="py-3 text-sm opacity-70">{t('no_other_sessions')}</li>
          )}
        </ul>
      )}
    </FormSection>
  )
}
