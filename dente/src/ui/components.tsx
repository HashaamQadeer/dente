import { type PropsWithChildren } from 'react'

export function Card({
  title,
  subtitle,
  children,
  right,
}: PropsWithChildren<{
  title?: string
  subtitle?: string
  right?: React.ReactNode
}>) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      {(title || subtitle || right) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            {title && <h2 className="text-base font-semibold text-slate-900">{title}</h2>}
            {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
          </div>
          {right ? <div className="shrink-0">{right}</div> : null}
        </header>
      )}
      <div className="px-5 py-4">{children}</div>
    </section>
  )
}

export function Button({
  variant = 'primary',
  size = 'md',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  size?: 'sm' | 'md'
}) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed'
  const sizes = {
    sm: 'h-9 px-3 text-sm',
    md: 'h-10 px-4 text-sm',
  }[size]
  const variants = {
    primary: 'bg-indigo-600 text-white hover:bg-indigo-700',
    secondary: 'bg-slate-100 text-slate-900 hover:bg-slate-200',
    danger: 'bg-rose-600 text-white hover:bg-rose-700',
    ghost: 'bg-transparent text-slate-700 hover:bg-slate-100',
  }[variant]
  return <button {...props} className={`${base} ${sizes} ${variants} ${props.className ?? ''}`} />
}

export function Input({
  label,
  hint,
  error,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string
  hint?: string
  error?: string
}) {
  return (
    <label className="block">
      <div className="text-sm font-medium text-slate-800">{label}</div>
      {hint ? <div className="mt-0.5 text-xs text-slate-500">{hint}</div> : null}
      <input
        {...props}
        className={`mt-2 h-10 w-full rounded-xl border bg-white px-3 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 ${
          error ? 'border-rose-300' : 'border-slate-200'
        } ${props.className ?? ''}`}
      />
      {error ? <div className="mt-1 text-xs text-rose-600">{error}</div> : null}
    </label>
  )
}

export function Textarea({
  label,
  hint,
  error,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string
  hint?: string
  error?: string
}) {
  return (
    <label className="block">
      <div className="text-sm font-medium text-slate-800">{label}</div>
      {hint ? <div className="mt-0.5 text-xs text-slate-500">{hint}</div> : null}
      <textarea
        {...props}
        rows={props.rows ?? 3}
        className={`mt-2 w-full rounded-xl border bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 ${
          error ? 'border-rose-300' : 'border-slate-200'
        } ${props.className ?? ''}`}
      />
      {error ? <div className="mt-1 text-xs text-rose-600">{error}</div> : null}
    </label>
  )
}

export function Select({
  label,
  hint,
  error,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & {
  label: string
  hint?: string
  error?: string
}) {
  return (
    <label className="block">
      <div className="text-sm font-medium text-slate-800">{label}</div>
      {hint ? <div className="mt-0.5 text-xs text-slate-500">{hint}</div> : null}
      <select
        {...props}
        className={`mt-2 h-10 w-full rounded-xl border bg-white px-3 text-sm text-slate-900 outline-none transition-colors focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 ${
          error ? 'border-rose-300' : 'border-slate-200'
        } ${props.className ?? ''}`}
      >
        {children}
      </select>
      {error ? <div className="mt-1 text-xs text-rose-600">{error}</div> : null}
    </label>
  )
}

export function Modal({
  title,
  open,
  onClose,
  children,
}: PropsWithChildren<{ title: string; open: boolean; onClose: () => void }>) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50">
      <button
        className="absolute inset-0 bg-slate-950/40"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div className="relative mx-auto mt-20 w-[min(720px,calc(100vw-2rem))] max-h-[calc(100vh-6rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="text-base font-semibold text-slate-900">{title}</div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="max-h-[calc(100vh-12rem)] overflow-auto px-5 py-4">{children}</div>
      </div>
    </div>
  )
}

