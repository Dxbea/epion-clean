// src/components/settings/ChangePasswordForm.tsx
import * as React from 'react'
import FormSection from '@/components/settings/FormSection'
import Button from '@/components/ui/Button'
import { API_BASE } from '@/config/api'
import { useToast } from '@/components/ui/Toast'
import { Link } from 'react-router-dom'
import { useMe } from '@/contexts/MeContext' // si tu as migré vers contexts/MeContext, garde plutôt `@/contexts/MeContext`

function pwErr(pw: string) {
  if (pw.length < 8) return 'Password must be at least 8 characters.'
  if (!/[A-Z]/.test(pw)) return 'Add at least one uppercase letter.'
  if (!/[a-z]/.test(pw)) return 'Add at least one lowercase letter.'
  if (!/[0-9]/.test(pw)) return 'Add at least one number.'
  if (!/[^A-Za-z0-9]/.test(pw)) return 'Add at least one special character.'
  return null
}

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 5C7 5 3.1 8 1.5 12c1.6 4 5.5 7 10.5 7s8.9-3 10.5-7C20.9 8 17 5 12 5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <circle
        cx="12"
        cy="12"
        r="3.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 3l18 18" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 5c-5 0-8.9 3-10.5 7a12.7 12.7 0 0 0 5.1 5.9M20.9 16.2C22.5 14.9 23.5 13.4 24 12c-1.6-4-5.5-7-10.5-7-1.1 0-2.1.1-3 .4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  )
}

type FieldProps = {
  label: string
  value: string
  onChange: (v: string) => void
  show: boolean
  setShow: (v: boolean) => void
  error?: string | null
  placeholder?: string
  autoComplete?: string
}

function PasswordField({
  label,
  value,
  onChange,
  show,
  setShow,
  error,
  placeholder,
  autoComplete,
}: FieldProps) {
  return (
    <div>
      {/* on GARDE les labels des inputs */}
      <label className="mb-1 block text-sm">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          autoComplete={autoComplete}
          className={`no-native-reveal w-full rounded-xl border bg-white px-3 py-2 pr-14 text-sm outline-none focus:ring-2 focus:ring-brand-blue dark:border-neutral-800 dark:bg-neutral-950 ${
            error ? 'border-red-500' : 'border-surface-200'
          }`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
        <button
          type="button"
          className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-surface-100 dark:hover:bg-neutral-900"
          onClick={() => setShow(!show)}
          aria-label={show ? 'Hide password' : 'Show password'}
        >
          <EyeIcon open={show} />
          <span>{show ? 'Hide' : 'Show'}</span>
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}

export default function ChangePasswordForm({
  id,
}: {
  id?: string
}) {
  const { push } = useToast()
  const { me } = useMe()

  // state pour les 3 champs
  const [current, setCurrent] = React.useState('')
  const [next, setNext] = React.useState('')
  const [confirm, setConfirm] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  // toggles show/hide
  const [showCurr, setShowCurr] = React.useState(false)
  const [showNext, setShowNext] = React.useState(false)
  const [showConfirm, setShowConfirm] = React.useState(false)

  // erreurs
  const [currErr, setCurrErr] = React.useState<string | null>(null)
  const [nextErr, setNextErr] = React.useState<string | null>(null)
  const [formErr, setFormErr] = React.useState<string | null>(null)
  const [formOk, setFormOk] = React.useState<string | null>(null)

  React.useEffect(() => {
    setCurrErr(null)
    setFormErr(null)
    setFormOk(null)
  }, [current])
  React.useEffect(() => {
    setNextErr(null)
    setFormErr(null)
    setFormOk(null)
  }, [next, confirm])

  const canSubmit =
    current.length > 0 && !pwErr(next) && next === confirm && !busy

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormErr(null)
    setFormOk(null)

    if (!current) {
      setCurrErr('Please enter your current password.')
      return
    }
    const pe = pwErr(next)
    if (pe) {
      setNextErr(pe)
      return
    }
    if (next !== confirm) {
      setNextErr('Passwords do not match.')
      return
    }

    try {
      setBusy(true)
      const res = await fetch(`${API_BASE}/api/auth/change-password`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      })

      if (res.status === 401) {
        setCurrErr('Current password is incorrect.')
        return
      }
      if (!res.ok) {
        setFormErr('Something went wrong. Please try again.')
        return
      }

      setFormOk('Password updated successfully.')
      push('Password updated', 'success')
      setCurrent('')
      setNext('')
      setConfirm('')
    } catch {
      setFormErr('Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  // reset link if user forgot password
  const [linkBusy, setLinkBusy] = React.useState(false)
  async function sendLink() {
    if (!me?.email) return
    try {
      setLinkBusy(true)
      await fetch(`${API_BASE}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: me.email }),
      })
      push(
        'If this email exists, a reset link has been generated.',
        'success'
      )
    } catch {
      push(
        'If this email exists, a reset link has been generated.',
        'success'
      )
    } finally {
      setLinkBusy(false)
    }
  }

  return (
    <FormSection
      id={id}
      // ⬅️ on laisse le titre externe ("Change password") géré par FormSection
      // et on enlève les sous-titres internes inutiles
      title="Change password"
      description={null}
      footer={null}
    >
      <div className="rounded-2xl border border-surface-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950 md:max-w-xl">
        {/* ⬅️ ici : PLUS de <H3> "Security", PLUS de paragraphe "Change your password..." */}
        {/* on commence direct par les champs */}

        <form onSubmit={onSubmit} noValidate className="grid gap-3">
          <PasswordField
            label="Current password"
            value={current}
            onChange={setCurrent}
            show={showCurr}
            setShow={setShowCurr}
            error={currErr}
            placeholder="••••••••"
            autoComplete="current-password"
          />

          <div>
            <PasswordField
              label="New password"
              value={next}
              onChange={setNext}
              show={showNext}
              setShow={setShowNext}
              error={nextErr}
              placeholder="At least 8 characters"
              autoComplete="new-password"
            />
            <p className="mt-1 text-[11px] opacity-70">
              8+ chars, 1 upper, 1 lower, 1 number, 1 special.
            </p>
          </div>

          <PasswordField
            label="Confirm new password"
            value={confirm}
            onChange={setConfirm}
            show={showConfirm}
            setShow={setShowConfirm}
            error={nextErr}
            placeholder="Repeat new password"
            autoComplete="new-password"
          />

          {formErr && (
            <p className="text-sm text-red-600">{formErr}</p>
          )}
          {formOk && (
            <p className="text-sm text-green-600">{formOk}</p>
          )}

          <div className="mt-1">
            <Button type="submit" variant="primary" disabled={!canSubmit}>
              {busy ? 'Saving…' : 'Update password'}
            </Button>
          </div>
        </form>

        {/* bloc "can't remember" qu'on GARDE sous le formulaire */}
        <div className="mt-6 rounded-xl border border-surface-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
          <div className="mb-2 text-lg font-semibold leading-snug text-neutral-900 dark:text-neutral-100">
            Can’t remember your current password?
          </div>

          <p className="mb-3 text-sm opacity-80">
            We can email you a secure link to set a new password.
          </p>

          <Button
            onClick={sendLink}
            disabled={linkBusy || !me?.email}
            className="bg-black text-white dark:bg-white dark:text-black"
          >
            {linkBusy ? 'Sending…' : 'Email me a secure link'}
          </Button>

          <div className="mt-2 text-xs opacity-80">
            …or go to{' '}
            <Link
              className="underline underline-offset-2"
              to="/settings#security"
            >
              Security
            </Link>
            .
          </div>
        </div>
      </div>
    </FormSection>
  )
}
