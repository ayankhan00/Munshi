export function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = typeof value === "number" ? String(value) : value;
  const safe = typeof value === "number" || !/^[=+\-@\t\r]/.test(s) ? s : `'${s}`;
  if (/[",\n\r]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const lines = [headers.map(csvEscape).join(",")];
  for (const row of rows) {
    lines.push(row.map(csvEscape).join(","));
  }
  return lines.join("\r\n");
}

export function csvBlob(content: string): string {
  return `\uFEFF${content}`;
}