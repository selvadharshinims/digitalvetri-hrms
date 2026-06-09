'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import type { InviteUserResponse } from '@dv-wms/types';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  useDeactivateUser,
  useDeleteUser,
  useGetUser,
  useInviteUser,
  useReactivateUser,
  useUserSummary,
} from '@/lib/api/users';
import { useAuthStore } from '@/lib/auth-store';

export default function UserDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const me = useAuthStore((s) => s.user);
  const userQuery = useGetUser(params.id);
  const summaryQuery = useUserSummary(params.id);
  const deactivate = useDeactivateUser();
  const reactivate = useReactivateUser();
  const deleteUser = useDeleteUser();
  const invite = useInviteUser();
  const [inviteResult, setInviteResult] = useState<InviteUserResponse | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  if (userQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  if (userQuery.isError || !userQuery.data) {
    return <p className="text-sm text-destructive">{(userQuery.error as Error)?.message ?? 'Not found'}</p>;
  }

  const u = userQuery.data;
  const isAdmin = me?.role === 'super_admin';
  const isSelf = me?.id === u.id;
  const canDeactivate = isAdmin && !isSelf && u.status === 'active';
  const canReactivate = isAdmin && u.status === 'inactive';
  const canDelete = isAdmin && !isSelf;

  async function handleDeactivate() {
    if (!confirm(`Deactivate ${u.full_name}? They will lose access immediately.`)) return;
    await deactivate.mutateAsync(u.id);
  }

  async function handleReactivate() {
    await reactivate.mutateAsync(u.id);
  }

  async function handleDelete() {
    if (
      !confirm(
        `Permanently delete ${u.full_name}? This removes the account and cannot be undone. If they have any activity history (tasks, leads, attendance, etc.) the delete will fail — deactivate instead.`,
      )
    )
      return;
    setDeleteError(null);
    try {
      await deleteUser.mutateAsync(u.id);
      router.push('/users');
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Failed to delete user');
    }
  }

  async function handleResendInvite() {
    setInviteError(null);
    setInviteResult(null);
    try {
      const res = await invite.mutateAsync(u.id);
      setInviteResult(res);
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Failed to resend invite');
    }
  }

  const canInvite = isAdmin && u.status === 'active';

  return (
    <div className="space-y-6">
      <PageHeader
        title={u.full_name}
        description={u.email}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/users">Back</Link>
            </Button>
            {canInvite && (
              <Button variant="outline" onClick={handleResendInvite} disabled={invite.isPending}>
                {invite.isPending ? 'Sending…' : 'Resend invite'}
              </Button>
            )}
            {canReactivate && (
              <Button onClick={handleReactivate} disabled={reactivate.isPending}>
                {reactivate.isPending ? 'Reactivating…' : 'Reactivate'}
              </Button>
            )}
            {canDeactivate && (
              <Button variant="destructive" onClick={handleDeactivate} disabled={deactivate.isPending}>
                {deactivate.isPending ? 'Deactivating…' : 'Deactivate'}
              </Button>
            )}
            {canDelete && (
              <Button variant="destructive" onClick={handleDelete} disabled={deleteUser.isPending}>
                {deleteUser.isPending ? 'Deleting…' : 'Delete'}
              </Button>
            )}
          </>
        }
      />

      {(inviteResult || inviteError || deleteError) && (
        <Card>
          <CardContent className="space-y-2 pt-5">
            {deleteError && (
              <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {deleteError}
              </p>
            )}
            {inviteError && (
              <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {inviteError}
              </p>
            )}
            {inviteResult && (
              <>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  New invite link sent
                </Label>
                <div className="break-all rounded-md border bg-muted p-3 font-mono text-xs">
                  {inviteResult.invite_url}
                </div>
                <p className="text-xs text-muted-foreground">
                  Expires {new Date(inviteResult.invite_expires_at).toLocaleString()}.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void navigator.clipboard.writeText(inviteResult.invite_url)}
                >
                  Copy link
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Profile</CardTitle>
            <CardDescription>
              <Badge variant="muted" className="mr-2">
                {u.role.replace('_', ' ')}
              </Badge>
              <Badge variant={u.status === 'active' ? 'success' : 'warning'}>{u.status}</Badge>
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
            <Field label="Phone" value={u.phone} />
            <Field label="Internship role" value={u.internship_role} />
            <Field label="Department" value={u.department} />
            <Field label="College" value={u.college} />
            <Field label="Degree" value={u.degree} />
            <Field label="Year of study" value={u.year_of_study} />
            <Field label="Joining date" value={u.joining_date} />
            <Field label="Joined platform" value={new Date(u.created_at).toLocaleDateString()} />
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Teams</CardTitle>
            </CardHeader>
            <CardContent>
              {u.memberships.length === 0 ? (
                <p className="text-sm text-muted-foreground">Not in any team yet.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {u.memberships.map((m) => (
                    <li key={m.team_id} className="flex items-center justify-between">
                      <Link href={`/teams/${m.team.id}`} className="hover:underline">
                        {m.team.name}
                      </Link>
                      {m.is_primary && <Badge variant="outline">primary</Badge>}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {u.led_teams.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Leads</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  {u.led_teams.map((t) => (
                    <li key={t.id}>
                      <Link href={`/teams/${t.id}`} className="hover:underline">
                        {t.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {summaryQuery.data && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Snapshot</CardTitle>
                <CardDescription>Internship summary</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-3 gap-3 text-center">
                <Metric label="Leads converted" value={summaryQuery.data.leads_converted} />
                <Metric label="Tasks completed" value={summaryQuery.data.tasks_completed} />
                <Metric label="Projects" value={summaryQuery.data.projects_contributed} />
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
      <p className="mt-0.5">{value ? value : <span className="text-muted-foreground">—</span>}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}
