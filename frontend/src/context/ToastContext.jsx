import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'

const ToastContext = createContext(null)

const ICONS = {
  success: CheckCircle2,
  error: AlertTriangle,
  info: Info,
}

const TONES = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/70 dark:text-emerald-100',
  error: 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/70 dark:text-rose-100',
  info: 'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900/60 dark:bg-sky-950/70 dark:text-sky-100',
}

const ICON_TONES = {
  success: 'text-emerald-600 dark:text-emerald-300',
  error: 'text-rose-600 dark:text-rose-300',
  info: 'text-sky-600 dark:text-sky-300',
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const counter = useRef(0)

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const push = useCallback(
    (type, title, message, duration = 5200) => {
      counter.current += 1
      const id = `toast-${counter.current}`
      setToasts((current) => [...current.slice(-3), { id, type, title, message }])
      if (duration) window.setTimeout(() => dismiss(id), duration)
      return id
    },
    [dismiss],
  )

  const success = useCallback((title, message) => push('success', title, message), [push])
  const error = useCallback((title, message) => push('error', title, message), [push])
  const info = useCallback((title, message) => push('info', title, message), [push])

  const value = useMemo(() => ({ toasts, push, dismiss, success, error, info }), [toasts, push, dismiss, success, error, info])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed bottom-5 right-5 z-[80] flex w-[min(92vw,380px)] flex-col gap-3"
      >
        {toasts.map((toast) => {
          const Icon = ICONS[toast.type] || Info
          return (
            <div
              key={toast.id}
              className={`pointer-events-auto flex items-start gap-3 rounded-2xl border p-4 shadow-soft backdrop-blur-xl ${TONES[toast.type] || TONES.info}`}
            >
              <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${ICON_TONES[toast.type] || ICON_TONES.info}`} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{toast.title}</p>
                {toast.message ? <p className="mt-1 text-xs leading-relaxed opacity-80">{toast.message}</p> : null}
              </div>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                className="rounded-lg p-1 opacity-60 transition hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
                aria-label="Dismiss notification"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used inside ToastProvider')
  return context
}
