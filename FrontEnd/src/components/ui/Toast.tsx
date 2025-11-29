import React from 'react'
import { createPortal } from 'react-dom'

type Variant = 'success' | 'error' | 'info'
type Toast = { id: string; message: string; variant: Variant }

const ToastCtx = React.createContext<{ push: (msg: string, v?: Variant) => void } | null>(null)
export function useToast() {
  const ctx = React.useContext(ToastCtx)
  if (!ctx) throw new Error('useToast must be used within <ToasterProvider>')
  return ctx
}

export function ToasterProvider({ children }: { children: React.ReactNode }) {
  const [list, setList] = React.useState<Toast[]>([])

  const push = React.useCallback((message: string, variant: Variant = 'info') => {
    const t: Toast = { id: crypto.randomUUID(), message, variant }
    setList((l) => [...l, t])
    setTimeout(() => setList((l) => l.filter((x) => x.id !== t.id)), 2200)
  }, [])

  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed inset-x-0 top-4 z-[9999] flex justify-center">
          <div className="flex w-full max-w-md flex-col gap-2 px-4">
            {list.map((t) => (
              <div
                key={t.id}
                className={`pointer-events-auto rounded-xl px-3 py-2 text-sm shadow-xl
                ${t.variant === 'success' ? 'bg-green-600 text-white' :
                   t.variant === 'error'   ? 'bg-red-600 text-white' :
                                             'bg-neutral-800 text-white'}`}
              >
                {t.message}
              </div>
            ))}
          </div>
        </div>,
        document.body
      )}
    </ToastCtx.Provider>
  )
}
