'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { LEAD_STATUSES, type LeadStatus } from '@dv-wms/types';
import { LeadStatusBadge } from '@/components/lead-status-badge';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  useAssignLead,
  useChangeLeadStatus,
  useGetLead,
  useUpdateLead,
} from '@/lib/api/leads';
import { useListUsers } from '@/lib/api/users';
import { useAuthStore } from '@/lib/auth-store';

export default function LeadDetailPage() {
  const params = useParams<{ id: string }>();
  const me = useAuthStore((s) => s.user);
  const lead = useGetLead(params.id);
  const users = useListUsers({ status: 'active', limit: 100 });

  const changeStatus = useChangeLeadStatus(params.id);
  const assign = useAssignLead(params.id);
  const update = useUpdateLead(params.id);

  const [nextStatus, setNextStatus] = useState<LeadStatus | ''>('');
  const [note, setNote] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [dealValue, setDealValue] = useState('');
  const [assignee, setAssignee] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (lead.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (lead.isError || !lead.data) {
    return <p className="text-sm text-destructive">{(lead.error as Error)?.message ?? 'Not found'}</p>;
  }

  const l = lead.data;
  const canModify =
    me?.role === 'super_admin' ||
    l.assigned_to === me?.id ||
    (me?.role === 'team_leader' && !!l.team_id && me.led_team_ids.includes(l.team_id)) ||
    (me?.role === 'intern' && !!l.team_id && me.member_team_ids.includes(l.team_id));
  const canReassign = me?.role === 'super_admin' || me?.role === 'team_leader';

  async function handleStatus(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!nextStatus) {
      setError('Pick a status first.');
      return;
    }
    const parsedDeal = dealValue ? Number(dealValue) : 0;
    if (nextStatus === 'converted' && (!parsedDeal || parsedDeal <= 0)) {
      setError('Deal value (₹) is required when marking the lead as converted.');
      return;
    }
    try {
      await changeStatus.mutateAsync({
        status: nextStatus,
        note: note.trim() || undefined,
        next_follow_up: followUp || undefined,
        deal_value: parsedDeal > 0 ? parsedDeal : undefined,
      });
      setNextStatus('');
      setNote('');
      setFollowUp('');
      setDealValue('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Status change failed');
    }
  }

  async function handleAssign() {
    if (!assignee) return;
    setError(null);
    try {
      await assign.mutateAsync(assignee);
      setAssignee('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Assign failed');
    }
  }

  async function handleFollowUpOnly(e: React.FormEvent) {
    e.preventDefault();
    if (!followUp) return;
    setError(null);
    try {
      await update.mutateAsync({ next_follow_up: followUp });
      setFollowUp('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={l.name}
        description={[l.phone, l.email].filter(Boolean).join(' · ')}
        actions={
          <Button variant="outline" asChild>
            <Link href="/leads">Back</Link>
          </Button>
        }
      />

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Status & details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <LeadStatusBadge status={l.status} />
                {l.next_follow_up && (
                  <Badge variant="warning">
                    Follow-up {new Date(l.next_follow_up).toLocaleDateString()}
                  </Badge>
                )}
                {l.team && <Badge variant="muted">{l.team.name}</Badge>}
                {l.source && <Badge variant="outline">{l.source}</Badge>}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Service interest" value={l.service_interest} />
                <Field label="Location" value={l.location} />
                <Field
                  label="Estimated value"
                  value={l.estimated_value ? `₹${l.estimated_value}` : null}
                />
                <Field
                  label="Deal value"
                  value={l.deal_value ? `₹${l.deal_value}` : null}
                />
                <Field
                  label="Assignee"
                  value={l.assignee?.full_name ?? 'Unassigned'}
                />
                <Field
                  label="Created"
                  value={new Date(l.created_at).toLocaleString()}
                />
              </div>

              {l.notes && (
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Notes</p>
                  <p className="mt-1 whitespace-pre-wrap">{l.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {canModify && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Change status</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleStatus} className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2">
                    <Label>New status</Label>
                    <Select
                      value={nextStatus}
                      onChange={(e) => setNextStatus(e.target.value as LeadStatus | '')}
                    >
                      <option value="">Choose…</option>
                      {LEAD_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s.replace('_', ' ')}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Next follow-up</Label>
                    <Input
                      type="date"
                      value={followUp}
                      onChange={(e) => setFollowUp(e.target.value)}
                    />
                  </div>
                  {nextStatus === 'converted' && (
                    <div className="space-y-2">
                      <Label>Deal value (₹) *</Label>
                      <Input
                        type="number"
                        min="1"
                        value={dealValue}
                        onChange={(e) => setDealValue(e.target.value)}
                        placeholder="Required for converted leads"
                      />
                    </div>
                  )}
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Note</Label>
                    <Textarea
                      rows={3}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Quick context on the change…"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Button
                      type="submit"
                      size="lg"
                      className="h-12 w-full text-base sm:w-auto"
                      disabled={changeStatus.isPending || !nextStatus}
                    >
                      {changeStatus.isPending ? 'Saving…' : 'Save status'}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          {canReassign && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Reassign</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                  <option value="">Choose user…</option>
                  {users.data?.data.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name}
                    </option>
                  ))}
                </Select>
                <Button onClick={handleAssign} disabled={!assignee || assign.isPending}>
                  {assign.isPending ? 'Assigning…' : 'Reassign'}
                </Button>
              </CardContent>
            </Card>
          )}

          {canModify && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Schedule follow-up</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleFollowUpOnly} className="space-y-3">
                  <Input
                    type="date"
                    value={followUp}
                    onChange={(e) => setFollowUp(e.target.value)}
                  />
                  <Button type="submit" disabled={!followUp || update.isPending}>
                    {update.isPending ? 'Saving…' : 'Set date'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Activity timeline</CardTitle>
            </CardHeader>
            <CardContent>
              {l.activities.length === 0 ? (
                <p className="text-sm text-muted-foreground">No activity yet.</p>
              ) : (
                <ol className="space-y-3">
                  {l.activities.map((a) => (
                    <li key={a.id} className="border-l pl-3">
                      <p className="text-xs text-muted-foreground">
                        {new Date(a.created_at).toLocaleString()}
                      </p>
                      <p className="text-sm">
                        {a.from_status && a.to_status ? (
                          <>
                            <span className="text-muted-foreground">
                              {a.from_status.replace('_', ' ')}
                            </span>{' '}
                            →{' '}
                            <span className="font-medium">
                              {a.to_status.replace('_', ' ')}
                            </span>
                          </>
                        ) : a.to_status ? (
                          <span className="font-medium">{a.to_status.replace('_', ' ')}</span>
                        ) : (
                          'Update'
                        )}
                      </p>
                      {a.note && <p className="text-sm text-muted-foreground">{a.note}</p>}
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5">{value || <span className="text-muted-foreground">—</span>}</p>
    </div>
  );
}
