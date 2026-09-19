/**
 * T65 — Generic CSV generator.
 * Accepts an array of flat objects and returns a CSV string.
 * Headers are derived from the keys of the first row.
 */
export function generateCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';

  const headers = Object.keys(rows[0]);
  const escape = (val: unknown): string => {
    const str = val === null || val === undefined ? '' : String(val);
    // Wrap in quotes if contains comma, quote, or newline
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const lines = [
    headers.join(','),
    ...rows.map((row) => headers.map((h) => escape(row[h])).join(',')),
  ];

  return lines.join('\n');
}

export function sendCsvResponse(
  res: import('express').Response,
  filename: string,
  rows: Record<string, unknown>[],
): void {
  const csv = generateCsv(rows);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}
