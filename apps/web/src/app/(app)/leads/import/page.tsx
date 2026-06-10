'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import type { ImportLeadRow, ImportLeadsResponse } from '@dv-wms/types';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useImportLeads } from '@/lib/api/leads';
import { useListTeams } from '@/lib/api/teams';
import { useListUsers } from '@/lib/api/users';
import { useAuthStore } from '@/lib/auth-store';

type ColumnRole =
  | 'ignore'
  | 'name'
  | 'phone'
  | 'email'
  | 'source'
  | 'service_interest'
  | 'location'
  | 'notes';

const COLUMN_OPTIONS: { value: ColumnRole; label: string }[] = [
  { value: 'name', label: 'Name' },
  { value: 'phone', label: 'Phone' },
  { value: 'email', label: 'Email' },
  { value: 'source', label: 'Source' },
  { value: 'service_interest', label: 'Service' },
  { value: 'location', label: 'Location' },
  { value: 'notes', label: 'Notes' },
  { value: 'ignore', label: '— Ignore —' },
];

const PHONE_RE = /^[+\d][\d\s\-().]{6,}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COMMON_SOURCES = new Set([
  'google maps',
  'google',
  'linkedin',
  'website',
  'cold call',
  'cold outreach',
  'referral',
  'facebook',
  'instagram',
  'whatsapp',
  'walk-in',
  'walk in',
  'event',
  'ad',
]);
const HEADER_TOKENS = new Set([
  'name',
  'phone',
  'mobile',
  'email',
  'source',
  'service',
  'service_interest',
  'location',
  'city',
  'notes',
  'note',
  'estimated_value',
]);

function splitLine(line: string): string[] {
  if (line.includes('\t')) return line.split('\t').map((s) => s.trim());
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"' && line[i + 1] === '"' && inQuotes) {
      current += '"';
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

function splitLines(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((l) => l.trim().length > 0);
}

function looksLikeHeader(cells: string[]): boolean {
  const hits = cells.filter((c) => HEADER_TOKENS.has(c.trim().toLowerCase())).length;
  return hits >= 2;
}

function detectRole(values: string[]): ColumnRole {
  const nonEmpty = values.filter((v) => v.trim().length > 0);
  if (nonEmpty.length === 0) return 'ignore';
  const phoneHits = nonEmpty.filter((v) => PHONE_RE.test(v.trim())).length;
  if (phoneHits / nonEmpty.length > 0.7) return 'phone';
  const emailHits = nonEmpty.filter((v) => EMAIL_RE.test(v.trim())).length;
  if (emailHits / nonEmpty.length > 0.7) return 'email';
  const sourceHits = nonEmpty.filter((v) => COMMON_SOURCES.has(v.trim().toLowerCase())).length;
  if (sourceHits / nonEmpty.length > 0.7) return 'source';
  return 'notes';
}

export default function ImportLeadsPage() {
  const router = useRouter();
  const me = useAuthStore((s) => s.user);
  const importMutation = useImportLeads();
  const teams = useListTeams();
  const users = useListUsers({ status: 'active', limit: 100 });

  const [text, setText] = useState('');
  const [defaultTeam, setDefaultTeam] = useState('');
  const [defaultAssignee, setDefaultAssignee] = useState('');
  const [defaultSource, setDefaultSource] = useState('');
  const [overrides, setOverrides] = useState<Record<number, ColumnRole>>({});
  const [parseError, setParseError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportLeadsResponse | null>(null);

  if (me?.role === 'intern') {
    return <p className="text-sm text-muted-foreground">Interns cannot import leads.</p>;
  }

  const grid = useMemo(() => {
    if (!text.trim()) return { rows: [] as string[][], cols: 0 };
    const lines = splitLines(text);
    let rows = lines.map(splitLine);
    if (rows.length > 0 && looksLikeHeader(rows[0]!)) rows = rows.slice(1);
    const cols = rows.reduce((m, r) => Math.max(m, r.length), 0);
    return { rows, cols };
  }, [text]);

  const detectedRoles = useMemo<ColumnRole[]>(() => {
    if (grid.cols === 0) return [];
    const raw: ColumnRole[] = [];
    for (let c = 0; c < grid.cols; c += 1) {
      raw.push(detectRole(grid.rows.map((r) => r[c] ?? '')));
    }
    const seen = new Set<ColumnRole>();
    const singles: ColumnRole[] = ['phone', 'email', 'source', 'name'];
    const final: ColumnRole[] = raw.map((r) => {
      if (singles.includes(r) && seen.has(r)) return 'notes';
      if (singles.includes(r)) seen.add(r);
      return r;
    });
    if (!final.includes('name')) {
      const idx = final.findIndex((r) => r === 'notes' || r === 'ignore');
      if (idx >= 0) final[idx] = 'name';
    }
    return final;
  }, [grid]);

  const columnRoles = detectedRoles.map((r, i) => overrides[i] ?? r);

  const setRole = (col: number, role: ColumnRole) => {
    setOverrides((prev) => ({ ...prev, [col]: role }));
  };

  function buildRows() {
    const rows: ImportLeadRow[] = [];
    const rowErrors: { row: number; message: string }[] = [];
    grid.rows.forEach((cells, rowIdx) => {
      const row: Partial<ImportLeadRow> = {};
      const notesPieces: string[] = [];
      columnRoles.forEach((role, colIdx) => {
        const cell = (cells[colIdx] ?? '').trim();
        if (!cell || role === 'ignore') return;
        if (role === 'notes') notesPieces.push(cell);
        else if (role === 'name') row.name = cell;
        else if (role === 'phone') row.phone = cell;
        else if (role === 'email') row.email = cell;
        else if (role === 'source') row.source = cell;
        else if (role === 'service_interest') row.service_interest = cell;
        else if (role === 'location') row.location = cell;
      });
      if (notesPieces.length > 0) row.notes = notesPieces.join(' | ');
      if (!row.source && defaultSource.trim()) row.source = defaultSource.trim();
      if (!row.name) {
        rowErrors.push({ row: rowIdx + 1, message: 'Missing name' });
        return;
      }
      if (!row.phone && !row.email) {
        rowErrors.push({ row: rowIdx + 1, message: 'Missing phone and email' });
        return;
      }
      rows.push(row as ImportLeadRow);
    });
    return { rows, rowErrors };
  }

  const preview = buildRows();
  const phoneMapped = columnRoles.includes('phone');
  const emailMapped = columnRoles.includes('email');
  const nameMapped = columnRoles.includes('name');

  async function handleImport() {
    setParseError(null);
    setResult(null);
    const { rows, rowErrors } = buildRows();
    if (rows.length === 0) {
      setParseError(
        'No importable rows. Make sure at least one column is mapped to Name, and one to Phone or Email.',
      );
      return;
    }
    try {
      const r = await importMutation.mutateAsync({
        rows,
        team_id: defaultTeam || undefined,
        assigned_to: defaultAssignee || undefined,
      });
      setResult({ ...r, errors: [...rowErrors, ...r.errors] });
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Import failed');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Import leads"
        description="Paste rows from any spreadsheet — Excel, Google Sheets, or CSV. We auto-detect each column; fix the mapping below if anything looks wrong."
      />

      <Card className="max-w-5xl">
        <CardContent className="space-y-4 pt-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Default team (optional)</Label>
              <Select value={defaultTeam} onChange={(e) => setDefaultTeam(e.target.value)}>
                <option value="">— None —</option>
                {teams.data?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Default assignee (optional)</Label>
              <Select value={defaultAssignee} onChange={(e) => setDefaultAssignee(e.target.value)}>
                <option value="">Unassigned</option>
                {users.data?.data.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Default source (optional)</Label>
              <Input
                placeholder="e.g. Google Maps"
                value={defaultSource}
                onChange={(e) => setDefaultSource(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Paste your sheet here</Label>
            <Textarea
              rows={10}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={
                'Paste rows directly from Excel / Google Sheets (or comma-separated text).\n\nExample:\nSiddha & Varma Clinic\t+919976475534\t\tGoogle Maps\tMedical clinic\tCoimbatore'
              }
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              Header row is optional — we ignore it if present. Tab-separated (Excel paste) and
              comma-separated both work.
            </p>
          </div>

          {parseError && <p className="text-sm text-destructive">{parseError}</p>}
        </CardContent>
      </Card>

      {grid.rows.length > 0 && (
        <Card className="max-w-5xl">
          <CardHeader>
            <CardTitle className="text-base">
              Preview — {preview.rows.length} importable / {grid.rows.length} pasted
            </CardTitle>
            <CardDescription>
              {!nameMapped && <span className="text-destructive">Map one column to Name. </span>}
              {!phoneMapped && !emailMapped && (
                <span className="text-destructive">Map a column to Phone or Email. </span>
              )}
              {nameMapped &&
                (phoneMapped || emailMapped) &&
                'Looks good. Adjust column types below if needed, then Import.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="w-10 px-2 py-1 text-left text-muted-foreground">#</th>
                    {columnRoles.map((role, idx) => (
                      <th key={idx} className="px-2 py-1 text-left">
                        <Select
                          value={role}
                          onChange={(e) => setRole(idx, e.target.value as ColumnRole)}
                          className="h-8 text-xs"
                        >
                          {COLUMN_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </Select>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {grid.rows.slice(0, 25).map((row, rowIdx) => (
                    <tr key={rowIdx} className="border-t">
                      <td className="px-2 py-1 text-muted-foreground">{rowIdx + 1}</td>
                      {columnRoles.map((_, colIdx) => (
                        <td key={colIdx} className="max-w-[180px] truncate px-2 py-1 font-mono">
                          {row[colIdx] ?? ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {grid.rows.length > 25 && (
              <p className="text-xs text-muted-foreground">
                Showing first 25 of {grid.rows.length} rows.
              </p>
            )}
            {preview.rowErrors.length > 0 && (
              <details className="rounded-md bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                <summary className="cursor-pointer">
                  {preview.rowErrors.length} row(s) will be skipped
                </summary>
                <ul className="mt-2 space-y-1">
                  {preview.rowErrors.slice(0, 20).map((e) => (
                    <li key={e.row}>
                      Row {e.row}: {e.message}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            <div className="flex gap-2">
              <Button
                onClick={handleImport}
                disabled={
                  importMutation.isPending ||
                  preview.rows.length === 0 ||
                  !nameMapped ||
                  (!phoneMapped && !emailMapped)
                }
              >
                {importMutation.isPending
                  ? 'Importing…'
                  : `Import ${preview.rows.length} lead${preview.rows.length === 1 ? '' : 's'}`}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.back()}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {result && (
        <Card className="max-w-5xl">
          <CardHeader>
            <CardTitle className="text-base">Import complete</CardTitle>
            <CardDescription>
              {result.imported} new leads · {result.skipped_duplicates} duplicates skipped ·{' '}
              {result.errors.length} errors
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {result.errors.length > 0 && (
              <ul className="space-y-1 text-destructive">
                {result.errors.slice(0, 30).map((e) => (
                  <li key={`${e.row}-${e.message}`}>
                    Row {e.row}: {e.message}
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2 pt-2">
              <Button onClick={() => router.push('/leads')}>Go to leads</Button>
              <Button
                variant="outline"
                onClick={() => {
                  setText('');
                  setOverrides({});
                  setResult(null);
                }}
              >
                Import more
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
