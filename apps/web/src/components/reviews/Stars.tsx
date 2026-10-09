/** Read-only star row. Half values round to the nearest whole star. */
export function Stars({ value, size = 'sm' }: { value: number; size?: 'sm' | 'md' }) {
  const filled = Math.round(value);
  const className = size === 'md' ? 'text-lg' : 'text-sm';

  return (
    <span className={`${className} leading-none text-amber-500`} aria-label={`${value} out of 5`}>
      {'★'.repeat(filled)}
      <span className="text-zinc-300 dark:text-zinc-700">{'★'.repeat(5 - filled)}</span>
    </span>
  );
}
