'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  useAddMember,
  useAssignLeader,
  useGetTeam,
  useRemoveMember,
} from '@/lib/api/teams';
import { useListUsers } from '@/lib/api/users';
import { useAuthStore } from '@/lib/auth-store';

export default function TeamDetailPage() {
  const params = useParams<{ id: string }>();
  const me = useAuthStore((s) => s.user);
  const team = useGetTeam(params.id);
  const usersForLeader = useListUsers({ role: 'team_leader', status: 'active', limit: 100 });
  const usersForMembers = useListUsers({ status: 'active', limit: 100 });

  const assignLeader = useAssignLeader(params.id);
  const addMember = useAddMember(params.id);
  const removeMember = useRemoveMember(params.id);

  const [leaderId, setLeaderId] = useState('');
  const [newMemberId, setNewMemberId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const memberIds = useMemo(
    () => new Set(team.data?.members.map((m) => m.user.id) ?? []),
    [team.data],
  );
  const candidateMembers = useMemo(
    () => usersForMembers.data?.data.filter((u) => !memberIds.has(u.id)) ?? [],
    [usersForMembers.data, memberIds],
  );

  if (team.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (team.isError || !team.data) {
    return <p className="text-sm text-destructive">{(team.error as Error)?.message ?? 'Not found'}</p>;
  }

  const t = team.data;
  const isAdmin = me?.role === 'super_admin';
  const isLeader = me?.role === 'team_leader' && me.led_team_ids.includes(t.id);
  const canManageMembers = isAdmin || isLeader;

  async function handleAssignLeader() {
    if (!leaderId) return;
    setError(null);
    try {
      await assignLeader.mutateAsync(leaderId);
      setLeaderId('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Assign failed');
    }
  }

  async function handleAddMember() {
    if (!newMemberId) return;
    setError(null);
    try {
      await addMember.mutateAsync({ user_id: newMemberId });
      setNewMemberId('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Add member failed');
    }
  }

  async function handleRemove(userId: string, name: string) {
    if (!confirm(`Remove ${name} from this team?`)) return;
    await removeMember.mutateAsync(userId);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.name}
        description={t.description ?? t.category ?? undefined}
        actions={
          <Button variant="outline" asChild>
            <Link href="/teams">Back</Link>
          </Button>
        }
      />

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Leader</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {t.leader ? (
              <div className="text-sm">
                <p className="font-medium">{t.leader.full_name}</p>
                <p className="text-muted-foreground">{t.leader.email}</p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No leader assigned.</p>
            )}
            {isAdmin && (
              <div className="space-y-2">
                <Select value={leaderId} onChange={(e) => setLeaderId(e.target.value)}>
                  <option value="">Choose a team leader…</option>
                  {usersForLeader.data?.data.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name} ({u.email})
                    </option>
                  ))}
                </Select>
                <Button onClick={handleAssignLeader} disabled={!leaderId || assignLeader.isPending}>
                  {assignLeader.isPending ? 'Assigning…' : 'Assign leader'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">
              Members <span className="text-muted-foreground">({t.members.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {canManageMembers && (
              <div className="flex flex-col gap-2 sm:flex-row">
                <Select
                  value={newMemberId}
                  onChange={(e) => setNewMemberId(e.target.value)}
                  className="flex-1"
                >
                  <option value="">Add a member…</option>
                  {candidateMembers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name} ({u.email})
                    </option>
                  ))}
                </Select>
                <Button onClick={handleAddMember} disabled={!newMemberId || addMember.isPending}>
                  {addMember.isPending ? 'Adding…' : 'Add'}
                </Button>
              </div>
            )}

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead>Primary?</TableHead>
                  {canManageMembers && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {t.members.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={canManageMembers ? 5 : 4} className="text-center text-muted-foreground">
                      No members yet.
                    </TableCell>
                  </TableRow>
                )}
                {t.members.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">
                      <Link href={`/users/${m.user.id}`} className="hover:underline">
                        {m.user.full_name}
                      </Link>
                      <p className="text-xs text-muted-foreground">{m.user.email}</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant="muted">{m.user.role.replace('_', ' ')}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(m.joined_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>{m.is_primary ? <Badge variant="outline">primary</Badge> : '—'}</TableCell>
                    {canManageMembers && (
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemove(m.user.id, m.user.full_name)}
                        >
                          Remove
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
