'use client';

import Link from 'next/link';
import { useState } from 'react';
import { LEAD_STATUSES, type LeadStatus } from '@dv-wms/types';
import { LeadStatusBadge } from '@/components/lead-status-badge';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useBulkDeleteLeads, useLeadFunnel, useListLeads } from '@/lib/api/leads';
import { useAuthStore } from '@/lib/auth-store';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 25;

const STATUS_FILTERS: { value: LeadStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  ...LEAD_STATUSES.map((s) => ({ value: s, label: s.replace('_', ' ') })),
];

export default function LeadsPage() {
  const me = useAuthStore((s) => s.user);
  const canCreate = me?.role !== 'intern';
  const canBulkDelete = me?.role === 'super_admin';

  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<LeadStatus | 'all'>('all');
  const [selected, setSelected] = useState<Record<string, true>>({});

  const list = useListLeads({
    page,
    limit: PAGE_SIZE,
    q: q || undefined,
    status: status === 'all' ? undefined : status,
  });
  const funnel = useLeadFunnel();
  const bulkDelete = useBulkDeleteLeads();
  const totalPages = list.data ? Math.max(1, Math.ceil(list.data.meta.total / PAGE_SIZE)) : 1;

  const pageIds = list.data?.data.map((l) => l.id) ?? [];
  const selectedIds = Object.keys(selected);
  const selectedCount = selectedIds.length;
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selected[id]);

  function toggleOne(id: string) {
    setSelected((prev) => {
      if (prev[id]) {
        const { [id]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [id]: true };
    });
  }

  function togglePage() {
    setSelected((prev) => {
      if (allOnPageSelected) {
        const next = { ...prev };
        for (const id of pageIds) delete next[id];
        return next;
      }
      const next = { ...prev };
      for (const id of pageIds) next[id] = true;
      return next;
    });
  }

  async function handleBulkDelete() {
    if (selectedCount === 0) return;
    const msg = `Delete ${selectedCount} lead${selectedCount === 1 ? '' : 's'} permanently? This cannot be undone.`;
    if (!window.confirm(msg)) return;
    await bulkDelete.mutateAsync(selectedIds);
    setSelected({});
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leads"
        description="Pipeline across the lead generation pod."
        actions={
          canCreate && (
            <>
              <Button variant="outline" asChild>
                <Link href="/leads/import">Import</Link>
              </Button>
              <Button asChild>
                <Link href="/leads/new">New lead</Link>
              </Button>
            </>
          )
        }
      />

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {LEAD_STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => {
              setStatus(s);
              setPage(1);
            }}
            className={cn(
              'rounded-md border bg-card px-3 py-3 text-left transition-colors hover:border-foreground/30',
              status === s && 'border-foreground/40 bg-accent',
            )}
          >
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              {s.replace('_', ' ')}
            </p>
            <p className="text-xl font-semibold">{funnel.data?.[s] ?? '—'}</p>
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="grid gap-3 sm:grid-cols-[1fr,auto]">
            <Input
              placeholder="Search by name, phone, or email…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
            <div className="flex flex-wrap gap-2">
              {STATUS_FILTERS.map((f) => (
                <Button
                  key={f.value}
                  variant={status === f.value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    setStatus(f.value);
                    setPage(1);
                  }}
                >
                  {f.label}
                </Button>
              ))}
            </div>
          </div>

          {canBulkDelete && selectedCount > 0 && (
            <div className="flex items-center justify-between rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm">
              <span>
                {selectedCount} lead{selectedCount === 1 ? '' : 's'} selected
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setSelected({})}>
                  Clear
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleBulkDelete}
                  disabled={bulkDelete.isPending}
                >
                  {bulkDelete.isPending ? 'Deleting…' : `Delete ${selectedCount}`}
                </Button>
              </div>
            </div>
          )}

          <Table>
            <TableHeader>
              <TableRow>
                {canBulkDelete && (
                  <TableHead className="w-10">
                    <input
                      type="checkbox"
                      aria-label="Select all on page"
                      checked={allOnPageSelected}
                      onChange={togglePage}
                      className="h-4 w-4 cursor-pointer"
                    />
                  </TableHead>
                )}
                <TableHead>Lead</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Assignee</TableHead>
                <TableHead>Team</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.isLoading && (
                <TableRow>
                  <TableCell colSpan={canBulkDelete ? 7 : 6} className="text-center text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {list.isError && (
                <TableRow>
                  <TableCell colSpan={canBulkDelete ? 7 : 6} className="text-center text-destructive">
                    {(list.error as Error).message}
                  </TableCell>
                </TableRow>
              )}
              {list.data?.data.length === 0 && (
                <TableRow>
                  <TableCell colSpan={canBulkDelete ? 7 : 6} className="text-center text-muted-foreground">
                    No leads match these filters.
                  </TableCell>
                </TableRow>
              )}
              {list.data?.data.map((l) => (
                <TableRow key={l.id}>
                  {canBulkDelete && (
                    <TableCell>
                      <input
                        type="checkbox"
                        aria-label={`Select ${l.name}`}
                        checked={!!selected[l.id]}
                        onChange={() => toggleOne(l.id)}
                        className="h-4 w-4 cursor-pointer"
                      />
                    </TableCell>
                  )}
                  <TableCell className="font-medium">
                    <Link href={`/leads/${l.id}`} className="hover:underline">
                      {l.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {[l.phone, l.email].filter(Boolean).join(' · ')}
                    </p>
                  </TableCell>
                  <TableCell>
                    <LeadStatusBadge status={l.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {l.assignee?.full_name ?? <span className="italic">Unassigned</span>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {l.team?.name ?? '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{l.source ?? '—'}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {l.last_activity_at
                      ? new Date(l.last_activity_at).toLocaleDateString()
                      : new Date(l.created_at).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <p>
              Page {page} of {totalPages} · {list.data?.meta.total ?? 0} total
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

