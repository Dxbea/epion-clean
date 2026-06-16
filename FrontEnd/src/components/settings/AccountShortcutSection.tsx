// src/components/settings/AccountShortcutSection.tsx
import React from 'react'
import FormSection from '@/components/settings/FormSection'
import { Body, H3 } from '@/components/ui/Typography'
import Button from '@/components/ui/Button'
import { Link } from 'react-router-dom'
import { useI18n } from '@/i18n/I18nContext'
import { useToast } from '@/components/ui/Toast'
import { useMe } from '@/contexts/MeContext'
import { authClient, getEmailVerificationCallbackURL } from '@/lib/better-auth-client'

export default function AccountShortcutSection({ id }: { id?: string }) {
  const { t } = useI18n()
  const { push } = useToast()
  const { me } = useMe()
  

  const verified = Boolean(me?.emailVerified)

  const [newEmail, setNewEmail] = React.useState('')
const [chgBusy, setChgBusy] = React.useState(false)

async function requestEmailChange() {
  if (!newEmail) return
  try {
    setChgBusy(true)
    const res = await authClient.changeEmail({
      newEmail: newEmail.trim().toLowerCase(),
      callbackURL: getEmailVerificationCallbackURL(),
    })
    if (res.error) throw new Error(res.error.message || `HTTP ${res.error.status || 400}`)
    push('If this address is valid, we sent a verification link.', 'success')
    setNewEmail('')
  } catch {
    push('If this address is valid, we sent a verification link.', 'success')
  } finally {
    setChgBusy(false)
  }
}


  return (
  <FormSection id={id} title={t('account')} description={t('account_short_desc')}>
    <div className="space-y-8">

      {/* ── Current email */}
      <div>
        <H3 as="div" className="mb-2 text-base">{t('email')}</H3>

        {/* email pill + resend on THE SAME ROW */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-xl border border-surface-200 px-3 py-2 text-sm dark:border-neutral-800">
            {me?.email || '—'}
          </div>

        </div>

        {/* Unverified badge BELOW the pill */}
        {!verified && (
          <div className="mt-2">
            <span className="rounded-full border px-2 py-0.5 text-xs">
              {t('unverified') || 'Unverified'}
            </span>
          </div>
        )}

        <Body className="mt-3 text-sm text-neutral-600 dark:text-neutral-400">
          {t('account_short_hint')}
        </Body>
      </div>

      {/* ── Change email */}
      <div className="border-t border-surface-200 pt-6 dark:border-neutral-800">
        <H3 as="div" className="mb-3 text-base">Change email</H3>

        <div className="flex items-center gap-2 md:max-w-lg">
          <input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="new@email.com"
            className="w-full rounded-xl border border-surface-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-blue dark:border-neutral-800 dark:bg-neutral-950"
          />
          <Button
            onClick={requestEmailChange}
            disabled={!newEmail || chgBusy}
            className="px-4 py-2 rounded-xl whitespace-nowrap"
          >
            {chgBusy ? 'Sending…' : 'Send link'}
          </Button>
        </div>

        <p className="mt-2 text-xs opacity-70">
          We’ll email a confirmation link to the new address.
        </p>
      </div>

      {/* shortcuts */}
      <div className="flex flex-wrap items-center gap-2 pt-2">
        <Button as={Link as any} to="/account">{t('menu_my_account')}</Button>
        <Button as={Link as any} to="/settings#security" variant="ghost">
          {t('security')}
        </Button>
      </div>
    </div>
  </FormSection>
);

}
