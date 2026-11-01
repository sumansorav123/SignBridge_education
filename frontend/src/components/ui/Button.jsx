import { Loader2 } from 'lucide-react'
import clsx from 'clsx'

const VARIANTS = {
  primary: 'btn-primary',
  brand: 'btn-brand',
  violet: 'btn-violet',
  ghost: 'btn-ghost',
  quiet: 'btn-quiet',
  danger: 'btn-danger',
}

const SIZES = {
  sm: 'px-3 py-1.5 text-xs rounded-xl',
  md: '',
  lg: 'px-6 py-3.5 text-base rounded-2xl',
}

export default function Button({
  as: Component = 'button',
  variant = 'primary',
  size = 'md',
  loading = false,
  icon: Icon,
  className,
  children,
  disabled,
  ...props
}) {
  return (
    <Component
      className={clsx(VARIANTS[variant] || VARIANTS.primary, SIZES[size], className)}
      disabled={Component === 'button' ? disabled || loading : undefined}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : Icon ? <Icon className="h-4 w-4" aria-hidden="true" /> : null}
      {children}
    </Component>
  )
}
