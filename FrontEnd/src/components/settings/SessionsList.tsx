import * as React from 'react'

import Button from '@/components/ui/Button'
import { API_BASE } from '@/config/api'
import { useI18n } from '@/i18n/I18nContext'
import { useToast } from '@/components/ui/Toast'

type Session = {
  id: string
  createdAt: string
  expiresAt: string | null
  current: boolean
}

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
      const response = await fetch(`${API_BASE}/api/auth/sessions`, { credentials: 'include' })
      if (!response.ok) throw new Error('HTTP ' + response.status)
      const json = await response.json()
      setList(json.sessions as Session[])
    } catch {
      push('Failed to load sessions', 'error')
    } finally {
      if (!silent) setLoading(false)
    }
  }

  React.useEffect(() => {
    fetchList()
  }, [])

  async function revokeOne(id: string) {
    const previous = list
    setList(previous.filter((session) => session.id !== id))

    try {
      const response = await fetch(`${API_BASE}/api/auth/sessions/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!response.ok) throw new Error('HTTP ' + response.status)
      push(t('saved'), 'success')
    } catch {
      setList(previous)
      push('Failed to revoke', 'error')
    }
  }

  async function revokeOthers() {
    try {
      setBusyAll(true)
      const response = await fetch(`${API_BASE}/api/auth/sessions/others`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!response.ok) throw new Error('HTTP ' + response.status)
      const { deleted } = await response.json()
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
    <section id={id} className="settings-subcard space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h4 className="font-serif text-3xl font-medium tracking-tight text-neutral-900 dark:text-neutral-50">
            {t('sessions')}
          </h4>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            {t('sessions_desc')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={onRefresh} variant="ghost" disabled={refreshing} className="min-h-[44px] rounded-full px-4">
            {refreshing ? '...' : t('sessions_refresh')}
          </Button>
          <Button onClick={revokeOthers} variant="primary" disabled={busyAll} className="min-h-[44px] rounded-full px-4">
            {busyAll ? '...' : t('revoke_all_others_btn')}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-sm opacity-70">Loading...</div>
      ) : (
        <ul className="divide-y divide-surface-200 dark:divide-neutral-800">
          {list.map((session) => (
            <li key={session.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <div className="text-sm font-medium">
                  {session.current ? t('this_device') : 'Session'}
                </div>
                <div className="text-xs opacity-70">
                  {t('last_active')}: {new Date(session.createdAt).toLocaleString()}
                </div>
              </div>
              <div className="shrink-0">
                {session.current ? (
                  <span className="chip">{t('this_device')}</span>
                ) : (
                  <Button variant="ghost" onClick={() => revokeOne(session.id)} className="min-h-[40px] rounded-full px-4">
                    {t('revoke')}
                  </Button>
                )}
              </div>
            </li>
          ))}
          {list.filter((session) => !session.current).length === 0 ? (
            <li className="py-3 text-sm opacity-70">{t('no_other_sessions')}</li>
          ) : null}
        </ul>
      )}
    </section>
  )
}
