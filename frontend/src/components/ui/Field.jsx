import { forwardRef, useId, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import clsx from 'clsx'

function Wrapper({ label, hint, error, required, htmlFor, children, className }) {
  return (
    <div className={className}>
      {label ? (
        <label htmlFor={htmlFor} className="label">
          {label}
          {required ? <span className="ml-1 text-rose-500">*</span> : null}
        </label>
      ) : null}
      {children}
      {error ? (
        <p className="mt-1.5 text-xs font-medium text-rose-600 dark:text-rose-300" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-ink-500 dark:text-ink-400">{hint}</p>
      ) : null}
    </div>
  )
}

export const Input = forwardRef(function Input(
  { label, hint, error, required, icon: Icon, className, id, ...props },
  ref,
) {
  const generated = useId()
  const fieldId = id || generated
  return (
    <Wrapper label={label} hint={hint} error={error} required={required} htmlFor={fieldId} className={className}>
      <div className="relative">
        {Icon ? (
          <Icon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
        ) : null}
        <input
          id={fieldId}
          ref={ref}
          className={clsx('input', Icon && 'pl-11', error && 'border-rose-400 focus:border-rose-400 focus:ring-rose-500/10')}
          aria-invalid={Boolean(error)}
          {...props}
        />
      </div>
    </Wrapper>
  )
})

export const Textarea = forwardRef(function Textarea(
  { label, hint, error, required, className, id, rows = 4, ...props },
  ref,
) {
  const generated = useId()
  const fieldId = id || generated
  return (
    <Wrapper label={label} hint={hint} error={error} required={required} htmlFor={fieldId} className={className}>
      <textarea id={fieldId} ref={ref} rows={rows} className={clsx('input resize-y', error && 'border-rose-400')} {...props} />
    </Wrapper>
  )
})

export const Select = forwardRef(function Select(
  { label, hint, error, required, className, id, children, placeholder, ...props },
  ref,
) {
  const generated = useId()
  const fieldId = id || generated
  return (
    <Wrapper label={label} hint={hint} error={error} required={required} htmlFor={fieldId} className={className}>
      <div className="relative">
        <select id={fieldId} ref={ref} className={clsx('select', error && 'border-rose-400')} {...props}>
          {placeholder ? <option value="">{placeholder}</option> : null}
          {children}
        </select>
        <svg
          className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z"
            clipRule="evenodd"
          />
        </svg>
      </div>
    </Wrapper>
  )
})

export const PasswordInput = forwardRef(function PasswordInput(
  { label, hint, error, className, id, ...props },
  ref,
) {
  const [visible, setVisible] = useState(false)
  const generated = useId()
  const fieldId = id || generated
  return (
    <Wrapper label={label} hint={hint} error={error} htmlFor={fieldId} className={className}>
      <div className="relative">
        <input
          id={fieldId}
          ref={ref}
          type={visible ? 'text' : 'password'}
          className={clsx('input pr-12', error && 'border-rose-400')}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((value) => !value)}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-ink-400 transition hover:text-ink-600 dark:hover:text-ink-200"
          aria-label={visible ? 'Hide password' : 'Show password'}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </Wrapper>
  )
})
