/**
 * Tiny CSV serializer for reports.
 *
 * Handles quoting per RFC 4180: wrap fields containing commas, quotes, or
 * newlines in double quotes and double-up any embedded quotes. UTF-8 BOM is
 * prepended so Excel on Windows opens the file with the correct encoding.
 */

export interface CsvColumn<T> {
  header: string;
  /** How to extract the value from a row. */
  get: (row: T) => unknown;
}

const BOM = '﻿';

export function toCsv<T>(columns: CsvColumn<T>[], rows: T[]): string {
  const headerLine = columns.map((c) => escape(c.header)).join(',');
  const dataLines = rows.map((r) =>
    columns.map((c) => escape(formatValue(c.get(r)))).join(','),
  );
  return BOM + [headerLine, ...dataLines].join('\r\n') + '\r\n';
}

function escape(s: string): string {
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/** Builds a filename like "intern-rankings_2026-06-07.csv". */
export function csvFilename(name: string, date = new Date()): string {
  const safe = name.replace(/[^a-z0-9-]+/gi, '-').toLowerCase();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${safe}_${y}-${m}-${d}.csv`;
}
