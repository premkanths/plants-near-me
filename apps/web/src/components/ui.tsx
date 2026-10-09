import type { InputHTMLAttributes, LabelHTMLAttributes, ReactNode } from 'react';

export function Field({
  label,
  hint,
  error,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {label}
        {props.required && <span className="text-rose-500"> *</span>}
      </span>
      <input
        {...props}
        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900"
      />
      {hint && !error && <span className="mt-1 block text-xs text-zinc-400">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-rose-500">{error}</span>}
    </label>
  );
}

export function Button({
  children,
  loading,
  variant = 'primary',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
  variant?: 'primary' | 'ghost';
}) {
  const styles =
    variant === 'primary'
      ? 'bg-emerald-600 text-white hover:bg-emerald-700'
      : 'border border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800';

  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={`inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${styles}`}
    >
      {loading ? 'Please wait…' : children}
    </button>
  );
}

export function Alert({
  kind = 'error',
  children,
}: {
  kind?: 'error' | 'info';
  children: ReactNode;
}) {
  const styles =
    kind === 'error'
      ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300'
      : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300';
  return <div className={`rounded-lg border px-3 py-2 text-sm ${styles}`}>{children}</div>;
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 ${className}`}
    >
      {children}
    </div>
  );
}

export function Legend(props: LabelHTMLAttributes<HTMLLegendElement>) {
  return (
    <legend
      {...props}
      className="mb-3 text-xs font-semibold tracking-wider text-zinc-400 uppercase"
    />
  );
}
