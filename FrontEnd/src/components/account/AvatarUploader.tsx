// FrontEnd/src/components/settings/AvatarUploader.tsx
import React from 'react'
import Button from '@/components/ui/Button'
import { API_BASE } from '@/config/api'
import { useToast } from '@/components/ui/Toast'
import { useMe } from '@/contexts/MeContext'
import { withCsrf } from '@/lib/csrf'

type Props = {
  value: string | null
  onChange: (url: string | null) => void
}

export default function AvatarUploader({ value, onChange }: Props) {
  const { push } = useToast()
  const { refresh } = useMe()
  const [busy, setBusy] = React.useState(false)

  async function upload(file: File) {
    const reader = new FileReader()
    reader.onload = async () => {
      const dataUrl = reader.result as string
      try {
        setBusy(true)

        const init = await withCsrf({
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataUrl }),
        })

        const res = await fetch(`${API_BASE}/api/me/avatar`, init)
        if (!res.ok) throw new Error()

        const json = await res.json()
        onChange(json.avatarUrl)
        await refresh()
        push('Avatar updated.', 'success')
      } catch {
        push('Upload failed.', 'error')
      } finally {
        setBusy(false)
      }
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="flex items-center gap-4">
      <div className="h-20 w-20 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
        {value ? (
          <img src={value} alt="avatar" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-neutral-500">
            —
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <label className="cursor-pointer">
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) upload(f)
            }}
          />
          <span className="inline-flex items-center rounded-xl border border-surface-200 px-3 py-2 text-sm hover:bg-surface-100 dark:border-neutral-700 dark:hover:bg-neutral-800">
            {busy ? 'Uploading…' : 'Change'}
          </span>
        </label>
        {value && (
          <Button variant="ghost" onClick={() => onChange(null)} disabled={busy}>
            Remove
          </Button>
        )}
      </div>
    </div>
  )
}
