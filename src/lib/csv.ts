/**
 * csv.ts
 * -------
 * Reusable CSV export helpers.
 *
 * Defends against CSV/formula injection (CVE-style): fields that begin with
 * a character interpreted as a spreadsheet formula (=, +, -, @, tab, CR, LF)
 * are prefixed with a single quote so they render as literal text rather than
 * executing when the file is opened in Excel/Sheets. Embedded double quotes
 * are escaped per RFC 4180.
 */

const FORMULA_CHAR_RE = /^[=+\-@\t\r]/;

/** Escape a single field per RFC 4180 and neutralize leading formula chars. */
export function csvEscapeField(value: unknown): string {
  const raw = value == null ? "" : String(value);
  const neutralized = FORMULA_CHAR_RE.test(raw) ? "'" + raw : raw;
  return '"' + neutralized.replace(/"/g, '""') + '"';
}

/** Build a CSV string from a header row and data rows. */
export function toCsv(
  headers: string[],
  rows: unknown[][],
): string {
  const lines: string[] = [];
  lines.push(headers.map(csvEscapeField).join(","));
  for (const row of rows) {
    lines.push(row.map(csvEscapeField).join(","));
  }
  return lines.join("\r\n");
}

/** Trigger a client-side download of a CSV string. */
export function downloadCsv(
  filename: string,
  content: string,
): void {
  const blob = new Blob(["\uFEFF" + content], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
