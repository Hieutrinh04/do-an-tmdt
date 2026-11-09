export function csvField(value: string | number) {
  if (typeof value === 'number') return String(value);
  const clean = value.replace(/[\r\n\0]+/g, ' ');
  const safe = /^\s*[=+\-@]/.test(clean) ? "'" + clean : clean;
  return '"' + safe.replaceAll('"', '""') + '"';
}
export const csvDocument = (rows: (string | number)[][]) => '\ufeff' + rows.map(row => row.map(csvField).join(',')).join('\r\n') + '\r\n';
