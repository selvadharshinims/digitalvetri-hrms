'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  TICKET_TYPES,
  type TicketPriority,
  type TicketStatus,
  type TicketType,
} from '@dv-wms/types';
import { PageHeader } from '@/components/page-header';
import {
  TICKET_STATUS_LABELS,
  TICKET_TYPE_LABELS,
  TicketPriorityBadge,
  TicketStatusBadge,
  TicketTypeBadge,
} from '@/components/ticket-badges';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useListTickets } from '@/lib/api/tickets';
import { useAuthStore } from '@/lib/auth-store';

const PAGE_SIZE = 25;

export default function TicketsPage() {
  const me = useAuthStore((s) => s.user);
  const isStaff = me?.role !== 'intern';

  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<TicketStatus | ''>('');
  const [type, setType] = useState<TicketType | ''>('');
  const [priority, setPriority] = useState<TicketPriority | ''>('');
  const [unattended, setUnattended] = useState(false);
  const [mine, setMine] = useState(false);

  const list = useListTickets({
    page,
    limit: PAGE_SIZE,
    q: q || undefined,
    status: status || undefined,
    type: type || undefined,
    priority: priority || undefined,
    unattended: unattended || undefined,
    mine: mine || undefined,
  });

  const totalPages = list.data ? Math.max(1, Math.ceil(list.data.meta.total / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tickets"
        description="Issues, leave requests, and support."
        actions={
          <Button asChild>
            <Link href="/tickets/new">New ticket</Link>
          </Button>
        }
      />

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="grid gap-3 sm:grid-cols-[1fr,160px,160px,160px]">
            <Input
              placeholder="Search by title or description…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
            <Select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as TicketStatus | '');
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              {TICKET_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {TICKET_STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
            <Select
              value={type}
              onChange={(e) => {
                setType(e.target.value as TicketType | '');
                setPage(1);
              }}
            >
              <option value="">All types</option>
              {TICKET_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TICKET_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
            <Select
              value={priority}
              onChange={(e) => {
                setPriority(e.target.value as TicketPriority | '');
                setPage(1);
              }}
            >
              <option value="">All priorities</option>
              {TICKET_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isStaff && (
              <Button
                variant={unattended ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setUnattended((v) => !v);
                  setPage(1);
                }}
              >
                Unattended only
              </Button>
            )}
            <Button
              variant={mine ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setMine((v) => !v);
                setPage(1);
              }}
            >
              Involves me
            </Button>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ticket</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Raised by</TableHead>
                <TableHead>Assignee</TableHead>
                <TableHead className="text-right">Age</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.isLoading && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {list.data?.data.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    No tickets match these filters.
                  </TableCell>
                </TableRow>
              )}
              {list.data?.data.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">
                    <Link href={`/tickets/${t.id}`} className="hover:underline">
                      {t.title}
                    </Link>
                    {t.message_count > 0 && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {t.message_count} messages
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <TicketTypeBadge type={t.type} />
                  </TableCell>
                  <TableCell>
                    <TicketStatusBadge status={t.status} />
                  </TableCell>
                  <TableCell>
                    <TicketPriorityBadge priority={t.priority} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {t.raiser?.full_name ?? '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {t.assignee?.full_name ?? <span className="italic">Unassigned</span>}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {formatAge(t.age_hours)}
                    {t.is_unattended && <Badge variant="destructive" className="ml-2">Unattended</Badge>}
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

function formatAge(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}
