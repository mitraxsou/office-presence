/** Escape a CSV cell (RFC 4180 style). Never include coordinates in callers. */
export function csvEscape(value: string | number | boolean | null | undefined): string {
  if (value == null) return "";
  const s = String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(headers: string[], rows: (string | number | boolean | null | undefined)[][]): string {
  const lines = [headers.map(csvEscape).join(",")];
  for (const row of rows) {
    lines.push(row.map(csvEscape).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}

export const CSV_CONTENT_TYPE = "text/csv; charset=utf-8";

export function csvResponse(body: string, filename: string): Response {
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": CSV_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
