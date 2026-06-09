'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { ImportLeadRow, ImportLeadsResponse } from '@dv-wms/types';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useImportLeads } from '@/lib/api/leads';
import { useListTeams } from '@/lib/api/teams';
import { useListUsers } from '@/lib/api/users';
import { useAuthStore } from '@/lib/auth-store';

const SAMPLE = `name,phone,email,source,service_interest,location,estimated_value
Aarti Sharma,+91 98765 12345,aarti@example.com,LinkedIn,CRM build,Bengaluru,50000
Ravi Patel,+91 99887 54321,,Cold outreach,Website,Pune,
`;

export default function ImportLeadsPage() {
  const router = useRouter();
  const me = useAuthStore((s) => s.user);
  const importMutation = useImportLeads();
  const teams = useListTeams();
  const users = useListUsers({ status: 'active', limit: 100 });

  const [text, setText] = useState('');
  const [defaultTeam, setDefaultTeam] = useState('');
  const [defaultAssignee, setDefaultAssignee] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportLeadsResponse | null>(null);

  if (me?.role === 'intern') {
    return <p className="text-sm text-muted-foreground">Interns cannot import leads.</p>;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setParseError(null);
    setResult(null);

    let rows: ImportLeadRow[];
    try {
      rows = parseCsv(text);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Could not parse CSV');
      return;
    }
    if (rows.length === 0) {
      setParseError('No rows detected. Paste CSV with a header row.');
      return;
    }

    try {
      const r = await importMutation.mutateAsync({
        rows,
        team_id: defaultTeam || undefined,
        assigned_to: defaultAssignee || undefined,
      });
      setResult(r);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Import failed');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Import leads"
        description="Paste CSV with a header row. Phone or email is required per row; duplicates against existing leads are skipped."
      />

      <Card className="max-w-4xl">
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4 pt-6">
            <div className="grid gap-4 sm:grid-cols-2">
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
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>CSV</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setText(SAMPLE)}
                >
                  Load sample
                </Button>
              </div>
              <Textarea
                rows={14}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Paste CSV here…"
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                Recognized columns: name, phone, email, source, service_interest, location, notes,
                estimated_value, team_id, assigned_to.
              </p>
            </div>

            {parseError && <p className="text-sm text-destructive">{parseError}</p>}

            <div className="flex gap-2">
              <Button type="submit" disabled={importMutation.isPending}>
                {importMutation.isPending ? 'Importing…' : 'Import'}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.back()}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </form>
      </Card>

      {result && (
        <Card className="max-w-4xl">
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
                {result.errors.map((e) => (
                  <li key={e.row}>
                    Row {e.row}: {e.message}
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2 pt-2">
              <Button onClick={() => router.push('/leads')}>Go to leads</Button>
              <Button variant="outline" onClick={() => setResult(null)}>
                Import more
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/**
 * Minimal CSV parser sufficient for pasted spreadsheets:
 * - First row is the header, lowercase-mapped to ImportLeadRow keys.
 * - Quoted fields support embedded commas and escaped quotes ("").
 * - Empty cells become undefined.
 */
function parseCsv(input: string): ImportLeadRow[] {
  const text = input.trim();
  if (!text) return [];
  const lines = splitCsvLines(text);
  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]!).map((h) => h.trim().toLowerCase());
  const allowed = new Set([
    'name',
    'phone',
    'email',
    'source',
    'service_interest',
    'location',
    'notes',
    'estimated_value',
    'team_id',
    'assigned_to',
  ]);

  const rows: ImportLeadRow[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cells = splitCsvLine(lines[i]!);
    const row: Record<string, string | number | undefined> = {};
    headers.forEach((h, idx) => {
      if (!allowed.has(h)) return;
      const raw = cells[idx]?.trim();
      if (!raw) return;
      if (h === 'estimated_value') {
        const n = Number(raw);
        if (!Number.isNaN(n)) row[h] = n;
      } else {
        row[h] = raw;
      }
    });
    if (!row['name']) {
      throw new Error(`Row ${i + 1} is missing the "name" column`);
    }
    rows.push(row as unknown as ImportLeadRow);
  }
  return rows;
}

function splitCsvLines(text: string): string[] {
  const out: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"' && text[i + 1] === '"') {
      current += '""';
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = !inQuotes;
      current += ch;
      continue;
    }
    if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (current.length) out.push(current);
      current = '';
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      continue;
    }
    current += ch;
  }
  if (current.length) out.push(current);
  return out;
}

function splitCsvLine(line: string): string[] {
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
      cells.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  cells.push(current);
  return cells;
}
