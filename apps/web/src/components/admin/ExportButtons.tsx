import { EXPORT_DATASETS } from '@/lib/admin-types';

/**
 * Plain links, not fetch + blob: the BFF forwards Content-Disposition, so the
 * browser downloads the file itself and we avoid holding a whole export in
 * memory on the client.
 */
export function ExportButtons() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs tracking-wider text-zinc-400 uppercase">Export CSV</span>
      {EXPORT_DATASETS.map((dataset) => (
        <a
          key={dataset}
          href={`/api/admin/export/${dataset}`}
          download
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 capitalize transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          ↓ {dataset}
        </a>
      ))}
    </div>
  );
}
