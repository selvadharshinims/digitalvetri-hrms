'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { TICKET_STATUSES, type TicketStatus } from '@dv-wms/types';
import { PageHeader } from '@/components/page-header';
import {
  TICKET_STATUS_LABELS,
  TicketPriorityBadge,
  TicketStatusBadge,
  TicketTypeBadge,
} from '@/components/ticket-badges';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  useAssignTicket,
  useChangeTicketStatus,
  useGetTicket,
  useSendTicketMessage,
} from '@/lib/api/tickets';
import { useListUsers } from '@/lib/api/users';
import { useAuthStore } from '@/lib/auth-store';
import { cn } from '@/lib/utils';

export default function TicketDetailPage() {
  const params = useParams<{ id: string }>();
  const me = useAuthStore((s) => s.user);
  const ticket = useGetTicket(params.id);
  const users = useListUsers({ status: 'active', limit: 100 });

  const sendMessage = useSendTicketMessage(params.id);
  const changeStatus = useChangeTicketStatus(params.id);
  const assign = useAssignTicket(params.id);

  const [message, setMessage] = useState('');
  const [nextStatus, setNextStatus] = useState<TicketStatus | ''>('');
  const [statusNote, setStatusNote] = useState('');
  const [newAssignee, setNewAssignee] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (ticket.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (ticket.isError || !ticket.data) {
    return <p className="text-sm text-destructive">{(ticket.error as Error)?.message ?? 'Not found'}</p>;
  }

  const t = ticket.data;
  const isRaiser = t.raised_by === me?.id;
  const isAssignee = t.assigned_to === me?.id;
  const isAdmin = me?.role === 'super_admin';
  const isLeaderOfTeam =
    me?.role === 'team_leader' && (t.team_id ? me.led_team_ids.includes(t.team_id) : false);
  const canManage = isAdmin || isAssignee || isLeaderOfTeam;
  const canReopen = isRaiser && (t.status === 'resolved' || t.status === 'closed');

  // What statuses the current viewer is allowed to set:
  const allowedStatuses: readonly TicketStatus[] = canManage
    ? TICKET_STATUSES
    : canReopen
      ? (['open'] as const)
      : [];

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    setError(null);
    try {
      await sendMessage.mutateAsync({ message: message.trim() });
      setMessage('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Send failed');
    }
  }

  async function handleStatus(e: React.FormEvent) {
    e.preventDefault();
    if (!nextStatus) return;
    setError(null);
    try {
      await changeStatus.mutateAsync({
        status: nextStatus,
        message: statusNote.trim() || undefined,
      });
      setNextStatus('');
      setStatusNote('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Status update failed');
    }
  }

  async function handleAssign() {
    if (!newAssignee) return;
    setError(null);
    try {
      await assign.mutateAsync({ assignee_id: newAssignee });
      setNewAssignee('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Assign failed');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.title}
        description={`Raised by ${t.raiser?.full_name ?? '—'} · ${formatAge(t.age_hours)} ago`}
        actions={
          <Button variant="outline" asChild>
            <Link href="/tickets">Back</Link>
          </Button>
        }
      />

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2">
                <TicketTypeBadge type={t.type} />
                <TicketStatusBadge status={t.status} />
                <TicketPriorityBadge priority={t.priority} />
                {t.is_unattended && <Badge variant="destructive">Unattended</Badge>}
                {t.team && (
                  <Badge variant="muted">
                    <Link href={`/teams/${t.team.id}`} className="hover:underline">
                      {t.team.name}
                    </Link>
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="whitespace-pre-wrap">{t.description}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Thread</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {t.messages.length === 0 ? (
                <p className="text-sm text-muted-foreground">No messages yet.</p>
              ) : (
                <ol className="space-y-3">
                  {t.messages.map((m) => {
                    const isSelf = m.sender_id === me?.id;
                    return (
                      <li
                        key={m.id}
                        className={cn(
                          'rounded-md border bg-card p-3 text-sm',
                          isSelf && 'border-foreground/30 bg-accent/40',
                        )}
                      >
                        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                          <span>
                            <span className="font-medium text-foreground">
                              {m.sender?.full_name ?? 'Unknown'}
                            </span>{' '}
                            · {m.sender?.role.replace('_', ' ')}
                          </span>
                          <span>{new Date(m.created_at).toLocaleString()}</span>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap">{m.message}</p>
                      </li>
                    );
                  })}
                </ol>
              )}

              <form onSubmit={handleSendMessage} className="space-y-2">
                <Textarea
                  rows={3}
                  placeholder="Add a message…"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
                <Button type="submit" disabled={!message.trim() || sendMessage.isPending}>
                  {sendMessage.isPending ? 'Sending…' : 'Send'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Detail</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Field
                label="Assignee"
                value={t.assignee?.full_name ?? 'Unassigned'}
              />
              <Field label="Raised" value={new Date(t.created_at).toLocaleString()} />
              <Field
                label="Last update"
                value={new Date(t.updated_at).toLocaleString()}
              />
              {t.closed_at && (
                <Field label="Closed" value={new Date(t.closed_at).toLocaleString()} />
              )}
            </CardContent>
          </Card>

          {allowedStatuses.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Change status</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleStatus} className="space-y-3">
                  <div className="space-y-2">
                    <Label>New status</Label>
                    <Select
                      value={nextStatus}
                      onChange={(e) => setNextStatus(e.target.value as TicketStatus | '')}
                    >
                      <option value="">Choose…</option>
                      {allowedStatuses.map((s) => (
                        <option key={s} value={s}>
                          {TICKET_STATUS_LABELS[s]}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Optional note</Label>
                    <Textarea
                      rows={2}
                      value={statusNote}
                      onChange={(e) => setStatusNote(e.target.value)}
                    />
                  </div>
                  <Button type="submit" disabled={!nextStatus || changeStatus.isPending}>
                    {changeStatus.isPending ? 'Updating…' : 'Update status'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}

          {(isAdmin || isLeaderOfTeam) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Reassign</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Select value={newAssignee} onChange={(e) => setNewAssignee(e.target.value)}>
                  <option value="">Choose user…</option>
                  {users.data?.data.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name}
                    </option>
                  ))}
                </Select>
                <Button onClick={handleAssign} disabled={!newAssignee || assign.isPending}>
                  {assign.isPending ? 'Assigning…' : 'Reassign'}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5">{value || <span className="text-muted-foreground">—</span>}</p>
    </div>
  );
}

function formatAge(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}
