// src/components/account/AccountProfileForm.tsx
import * as React from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { withCsrf } from '@/lib/csrf'
import FormSection from '@/components/settings/FormSection'
import { H3, Body } from '@/components/ui/Typography'
import Button from '@/components/ui/Button'
import AvatarUploader from '@/components/account/AvatarUploader'
import { useI18n } from '@/i18n/I18nContext'
import { API_BASE } from '@/config/api'
import { useToast } from '@/components/ui/Toast'
import VerifyEmailBanner from './VerifyEmailBanner'
import { useMe } from '@/contexts/MeContext'

// ─────────────────────────────
// Validation form
// ─────────────────────────────
const USERNAME_RX = /^[a-z0-9_]{3,20}$/i

const schema = z.object({
  displayName: z.string().min(1, 'Required'),
  username: z.string().regex(USERNAME_RX, 'Username invalid'),
  phone: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

// NOTE: on n'a pas besoin de redéclarer ServerMe séparément, car on lit déjà
// la forme depuis le contexte. Mais pour la clarté du code ci-dessous,
// je note ce qu'on attend du backend.
type ServerMe = {
  id: string
  email: string
  emailVerifiedAt: string | null
  displayName: string
  username: string
  phone: string | null
  avatarUrl: string | null
  role: string
}

// ─────────────────────────────
// Composant principal
// ─────────────────────────────
export default function AccountProfileForm() {
  const { t } = useI18n()
  const { push } = useToast()

  // depuis le contexte global
  const { me, loading, refresh, logout, updateLocal } = useMe()

  // état local d'affichage "Saved" (badge vert)
  const [saved, setSaved] = React.useState(false)

  // état pour le skeleton "Checking…"
  const [checkingU, setCheckingU] = React.useState(false)

  // on garde un cache local d'avatar uniquement pour l'UI
  const [localAvatar, setLocalAvatar] = React.useState<string | null>(null)

  // react-hook-form
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty, isSubmitting },
    setError,
    clearErrors,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

  // ─────────────────────────────
  // Pré-remplir le form quand "me" (du contexte) est dispo / change
  // ─────────────────────────────
  React.useEffect(() => {
    if (!me) return

    reset({
      displayName: me.displayName || '',
      username: me.username || '',
      phone: me.phone || '',
    })
    setLocalAvatar(me.avatarUrl || null)
  }, [me, reset])

  // ─────────────────────────────
  // Vérif d'un username en blur
  // ─────────────────────────────
  async function checkUsername(u: string) {
    if (!/^[a-z0-9_]{3,20}$/i.test(u)) return
    try {
      setCheckingU(true)
      const res = await fetch(
        `${API_BASE}/api/me/username/available?u=${encodeURIComponent(u)}`,
        { credentials: 'include' }
      )
      const json = await res.json().catch(() => ({}))
      if (json && json.available === false) {
        setError('username', { type: 'server', message: t('username_error') })
      }
    } catch {
      // silencieux
    } finally {
      setCheckingU(false)
    }
  }

  // ─────────────────────────────
  // Submit "Save profile"
  // ─────────────────────────────
    async function onSubmit(values: FormValues) {
    clearErrors('username')

    try {
      const init = await withCsrf({
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: values.displayName,
          username: values.username,
          phone: values.phone || null,
          avatarUrl: localAvatar ?? null,
        }),
      })

      const res = await fetch(`${API_BASE}/api/me`, init)

      if (res.status === 409) {
        setError('username', { type: 'server', message: t('username_error') })
        push('This username is already taken.', 'error')
        return
      }
      if (res.status === 400) {
        setError('username', { type: 'server', message: t('username_error') })
        push('Invalid input.', 'error')
        return
      }
      if (!res.ok) {
        throw new Error('HTTP ' + res.status)
      }

      updateLocal({
        displayName: values.displayName,
        username: values.username,
        phone: values.phone || null,
        avatarUrl: localAvatar ?? null,
      })

      setSaved(true)
      setTimeout(() => setSaved(false), 1200)
      reset(values)
      push('Profile saved.', 'success')
    } catch {
      push('Failed to save profile.', 'error')
    }
  }


  // ─────────────────────────────
  // Logout bouton du footer
  // ─────────────────────────────
  async function onLogoutClick() {
    try {
      await logout()
      push('Signed out.', 'success')
      // pas de redirect forcé ici,
      // tu peux filmer en mode "je me déconnecte, paf ya plus le profil"
    } catch {
      // au pire
      push('Sign out failed.', 'error')
    }
  }

  // ─────────────────────────────
  // Rendu
  // ─────────────────────────────
  // loading global (provider pas prêt) => skeleton
  if (loading && !me) {
    return (
      <>
        <VerifyEmailBanner />
        <FormSection
          title={t('profile_info')}
          description={t('profile_info_desc')}
          footer={
            <div className="flex items-center gap-3">
              <Button variant="primary" disabled>
                {t('saving')}
              </Button>
              <Button variant="ghost" disabled>
                Logout
              </Button>
            </div>
          }
        >
          <div className="animate-pulse space-y-6 max-w-md">
            <div className="h-5 w-1/3 bg-neutral-200 dark:bg-neutral-800 rounded" />
            <div className="h-10 w-full bg-neutral-200 dark:bg-neutral-800 rounded" />
            <div className="h-10 w-full bg-neutral-200 dark:bg-neutral-800 rounded" />
            <div className="h-10 w-full bg-neutral-200 dark:bg-neutral-800 rounded" />
            <div className="h-10 w-2/3 bg-neutral-200 dark:bg-neutral-800 rounded" />
          </div>
        </FormSection>
      </>
    )
  }

  // si pas connecté du tout (me == null mais plus loading),
  // on peut quand même montrer un state "déconnecté".
  if (!me) {
    return (
      <>
        <VerifyEmailBanner />
        <FormSection
          title={t('profile_info')}
          description={t('profile_info_desc')}
          footer={
            <div className="flex items-center gap-3">
              <Button as="a" href="/settings#account" variant="primary">
                Sign in
              </Button>
            </div>
          }
        >
          <div className="text-sm opacity-70">
            You’re not signed in.
          </div>
        </FormSection>
      </>
    )
  }

  // état normal connecté
  return (
    <>
      <VerifyEmailBanner />

      <FormSection
        title={t('profile_info')}
        description={t('profile_info_desc')}
        footer={
          <div className="flex items-center gap-3">
            <Button
              variant="primary"
              disabled={loading || !isDirty || isSubmitting}
              onClick={handleSubmit(onSubmit)}
            >
              {isSubmitting ? t('saving') : t('save')}
            </Button>

            <Button
              variant="ghost"
              onClick={onLogoutClick}
            >
              Logout
            </Button>

            {saved && (
              <span className="text-sm text-green-600 dark:text-green-400">
                {t('saved')}
              </span>
            )}
          </div>
        }
      >
        {loading ? (
          // skeleton quand on a me mais on est en refresh() ou autre
          <div className="animate-pulse space-y-6 max-w-md">
            <div className="h-5 w-1/3 bg-neutral-200 dark:bg-neutral-800 rounded" />
            <div className="h-10 w-full bg-neutral-200 dark:bg-neutral-800 rounded" />
            <div className="h-10 w-full bg-neutral-200 dark:bg-neutral-800 rounded" />
            <div className="h-10 w-full bg-neutral-200 dark:bg-neutral-800 rounded" />
            <div className="h-10 w-2/3 bg-neutral-200 dark:bg-neutral-800 rounded" />
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {/* Avatar */}
            <div>
              <H3 as="div" className="mb-2 text-base">
                {t('avatar')}
              </H3>
              <Body className="mb-3">{t('avatar_desc')}</Body>

              <AvatarUploader
                value={localAvatar}
                onChange={(url: string | null) => {
                  setLocalAvatar(url)
                  // petit patch optimiste header instantané :
                  updateLocal({ avatarUrl: url })
                }}
              />
            </div>

            {/* Identity / info compte */}
            <div className="grid gap-4">
              <div>
                <H3 as="div" className="mb-1 text-base">{t('email')}</H3>
                <div className="flex items-center gap-2">
                  <div className="rounded-xl border border-surface-200 px-3 py-2 text-sm dark:border-neutral-800">
                    {me.email}
                  </div>

                  {me.emailVerifiedAt ? (
                    <span className="rounded-full bg-green-100 px-2 py-1 text-xs text-green-700 dark:bg-green-900/30 dark:text-green-300">
                      {t('verified')}
                    </span>
                  ) : (
                    <span className="rounded-full bg-yellow-100 px-2 py-1 text-xs text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
                      {t('unverified')}
                    </span>
                  )}
                </div>
              </div>

              <div>
                <label
                  className="mb-1 block text-sm"
                  htmlFor="displayName"
                >
                  {t('display_name')}
                </label>
                <input
                  id="displayName"
                  className="w-full rounded-xl border border-surface-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-blue dark:border-neutral-800 dark:bg-neutral-950"
                  {...register('displayName')}
                />
                {errors.displayName && (
                  <p className="mt-1 text-sm text-red-600">
                    {t('required')}
                  </p>
                )}
              </div>

              <div>
                <label
                  className="mb-1 block text-sm"
                  htmlFor="username"
                >
                  {t('username')}
                </label>
                <input
                  id="username"
                  onBlur={(e) => checkUsername(e.target.value)}
                  className={`w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-blue ${
                    errors.username
                      ? 'border-red-500 bg-white dark:bg-neutral-950'
                      : 'border-surface-200 bg-white dark:border-neutral-800 dark:bg-neutral-950'
                  }`}
                  {...register('username')}
                />
                {checkingU && (
                  <p className="mt-1 text-xs opacity-70">Checking…</p>
                )}
                {errors.username ? (
                  <p className="mt-1 text-sm text-red-600">
                    {errors.username.message || t('username_error')}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-neutral-500">
                    {t('username_help')}
                  </p>
                )}
              </div>

              <div>
                <label
                  className="mb-1 block text-sm"
                  htmlFor="phone"
                >
                  {t('phone')}
                </label>
                <input
                  id="phone"
                  className="w-full rounded-xl border border-surface-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-blue dark:border-neutral-800 dark:bg-neutral-950"
                  {...register('phone')}
                />
              </div>
            </div>
          </div>
        )}
      </FormSection>
    </>
  )
}
