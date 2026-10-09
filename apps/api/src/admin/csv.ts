/**
 * Minimal RFC 4180 CSV writer.
 *
 * Deliberately hand-rolled rather than pulled from npm: the whole surface is
 * "quote the field if it needs quoting", and two details matter more than
 * features.
 *
 * 1. Spreadsheets treat a leading `=`, `+`, `-` or `@` as the start of a
 *    formula. A vendor called `=HYPERLINK(...)` would then execute on an
 *    admin's machine when they open the export. We prefix those with a
 *    single quote, which Excel and Sheets strip on display.
 * 2. Excel only recognises UTF-8 if the file starts with a BOM, otherwise
 *    Indian names and the ₹ sign arrive as mojibake.
 */

export type CsvValue = string | number | boolean | Date | null | undefined;

const RISKY_PREFIX = /^[=+\-@\t\r]/;

export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return '';

  let text =
    value instanceof Date
      ? value.toISOString()
      : typeof value === 'boolean'
        ? value
          ? 'yes'
          : 'no'
        : String(value);

  if (RISKY_PREFIX.test(text)) text = `'${text}`;

  // Quote when the field contains a delimiter, a quote or a line break.
  if (/[",\n\r]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;

  return text;
}

export function toCsv(headers: string[], rows: CsvValue[][]): string {
  const lines = [headers.map(csvCell).join(','), ...rows.map((row) => row.map(csvCell).join(','))];
  // \r\n keeps Excel happy; the BOM makes it read the file as UTF-8.
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

/** `orders-2026-10-01.csv` */
export function csvFilename(dataset: string, now = new Date()): string {
  return `${dataset}-${now.toISOString().slice(0, 10)}.csv`;
}
