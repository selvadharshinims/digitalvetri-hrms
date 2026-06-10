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
import { useLeadFunnel, useListLeads } from '@/lib/api/leads';
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

  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<LeadStatus | 'all'>('all');

  const list = useListLeads({
    page,
    limit: PAGE_SIZE,
    q: q || undefined,
    status: status === 'all' ? undefined : status,
  });
  const funnel = useLeadFunnel();
  const totalPages = list.data ? Math.max(1, Math.ceil(list.data.meta.total / PAGE_SIZE)) : 1;

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

          <Table>
            <TableHeader>
              <TableRow>
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
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {list.isError && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-destructive">
                    {(list.error as Error).message}
                  </TableCell>
                </TableRow>
              )}
              {list.data?.data.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No leads match these filters.
                  </TableCell>
                </TableRow>
              )}
              {list.data?.data.map((l) => (
                <TableRow key={l.id}>
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

