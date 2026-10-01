'use client';

import { useState } from 'react';

/** Clickable 1–5 stars. Hover previews the score before committing. */
export function StarPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: number;
  onChange: (rating: number) => void;
  disabled?: boolean;
}) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;

  return (
    <div className="flex gap-1" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={disabled}
          aria-label={`${star} star${star > 1 ? 's' : ''}`}
          onMouseEnter={() => setHover(star)}
          onClick={() => onChange(star)}
          className={`text-2xl leading-none transition disabled:opacity-50 ${
            star <= shown ? 'text-amber-500' : 'text-zinc-300 dark:text-zinc-700'
          }`}
        >
          ★
        </button>
      ))}
    </div>
  );
}
