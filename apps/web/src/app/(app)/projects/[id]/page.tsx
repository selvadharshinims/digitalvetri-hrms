'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { PROJECT_STATUSES, type ProjectStatus } from '@dv-wms/types';
import { PageHeader } from '@/components/page-header';
import { DeadlineBadge, ProjectStatusBadge, PROJECT_STATUS_LABELS } from '@/components/project-badges';
import { ProjectRiskBadge } from '@/components/project-risk-badge';
import { TaskPriorityBadge, TaskStatusBadge } from '@/components/task-badges';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import {
  useAddDeliverable,
  useGetProject,
  useRemoveDeliverable,
  useSyncProjectProgress,
  useUpdateDeliverable,
  useUpdateProject,
} from '@/lib/api/projects';
import { useAuthStore } from '@/lib/auth-store';
import { cn } from '@/lib/utils';

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const me = useAuthStore((s) => s.user);
  const project = useGetProject(params.id);

  const update = useUpdateProject(params.id);
  const syncProgress = useSyncProjectProgress(params.id);
  const addDeliverable = useAddDeliverable(params.id);
  const updateDeliverable = useUpdateDeliverable(params.id);
  const removeDeliverable = useRemoveDeliverable(params.id);

  const [status, setStatus] = useState<ProjectStatus>('planning');
  const [progress, setProgress] = useState(0);
  const [deadline, setDeadline] = useState('');
  const [newDeliverable, setNewDeliverable] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!project.data) return;
    setStatus(project.data.status);
    setProgress(project.data.progress_pct);
    setDeadline(project.data.deadline ? project.data.deadline.slice(0, 10) : '');
  }, [project.data]);

  if (project.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (project.isError || !project.data) {
    return <p className="text-sm text-destructive">{(project.error as Error)?.message ?? 'Not found'}</p>;
  }

  const p = project.data;
  const canManage =
    me?.role === 'super_admin' ||
    (me?.role === 'team_leader' && me.led_team_ids.includes(p.team_id));

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const body: Record<string, unknown> = {};
      if (status !== p.status) body.status = status;
      if (progress !== p.progress_pct) body.progress_pct = progress;
      if (deadline && deadline !== (p.deadline?.slice(0, 10) ?? '')) body.deadline = deadline;
      if (Object.keys(body).length === 0) return;
      await update.mutateAsync(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    }
  }

  async function handleSync() {
    setError(null);
    try {
      await syncProgress.mutateAsync();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed');
    }
  }

  async function handleAddDeliverable(e: React.FormEvent) {
    e.preventDefault();
    if (!newDeliverable.trim()) return;
    try {
      await addDeliverable.mutateAsync({ title: newDeliverable.trim() });
      setNewDeliverable('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Add deliverable failed');
    }
  }

  const storedProgress = Math.min(100, Math.max(0, p.progress_pct));
  const derived = Math.min(100, Math.max(0, p.derived_progress_pct));
  const driftsFromDerived = derived !== storedProgress;

  return (
    <div className="space-y-6">
      <PageHeader
        title={p.name}
        description={[p.client_name, p.category].filter(Boolean).join(' · ') || undefined}
        actions={
          <Button variant="outline" asChild>
            <Link href="/projects">Back</Link>
          </Button>
        }
      />

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Overview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <ProjectStatusBadge status={p.status} />
                <DeadlineBadge deadline={p.deadline} risk={p.deadline_risk} />
                <ProjectRiskBadge
                  score={p.ai_risk_score}
                  band={p.ai_risk_band}
                  scoredAt={p.ai_risk_at}
                />
                {p.team && (
                  <Badge variant="muted">
                    <Link href={`/teams/${p.team.id}`} className="hover:underline">
                      {p.team.name}
                    </Link>
                  </Badge>
                )}
              </div>

              {p.ai_risk_score !== null && (p.ai_risk_concern || (p.ai_risk_actions && p.ai_risk_actions.length > 0)) && (
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">
                    AI risk · {p.ai_risk_score} {p.ai_risk_band && `(${p.ai_risk_band.replace('_', ' ')})`}
                    {p.ai_risk_at && (
                      <span className="ml-2 normal-case">
                        assessed {new Date(p.ai_risk_at).toLocaleString()}
                      </span>
                    )}
                  </p>
                  {p.ai_risk_concern && (
                    <p className="mt-1 text-sm">
                      <span className="font-medium">Top concern:</span> {p.ai_risk_concern}
                    </p>
                  )}
                  {p.ai_risk_actions && p.ai_risk_actions.length > 0 && (
                    <div className="mt-2 text-sm">
                      <p className="font-medium">Suggested actions:</p>
                      <ol className="ml-5 mt-1 list-decimal space-y-1">
                        {p.ai_risk_actions.map((a, idx) => (
                          <li key={idx}>{a}</li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
              )}

              <div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Stored progress</span>
                  <span>{storedProgress}%</span>
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded bg-muted">
                  <div className="h-full bg-primary" style={{ width: `${storedProgress}%` }} />
                </div>
                {driftsFromDerived && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Derived from deliverables &amp; tasks: <span className="font-medium">{derived}%</span>
                    {canManage && (
                      <Button
                        variant="link"
                        size="sm"
                        onClick={handleSync}
                        disabled={syncProgress.isPending}
                        className="h-auto px-2 py-0"
                      >
                        Sync from work
                      </Button>
                    )}
                  </p>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Start date" value={p.start_date ? new Date(p.start_date).toLocaleDateString() : null} />
                <Field label="Deadline" value={p.deadline ? new Date(p.deadline).toLocaleDateString() : null} />
                <Field label="Deliverables" value={`${p.deliverables_done}/${p.deliverables_total}`} />
                <Field label="Tasks" value={`${p.tasks_completed}/${p.tasks_total}`} />
              </div>

              {p.description && (
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Description</p>
                  <p className="mt-1 whitespace-pre-wrap">{p.description}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Deliverables{' '}
                <span className="text-muted-foreground">
                  ({p.deliverables_done}/{p.deliverables_total})
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {canManage && (
                <form onSubmit={handleAddDeliverable} className="flex gap-2">
                  <Input
                    value={newDeliverable}
                    onChange={(e) => setNewDeliverable(e.target.value)}
                    placeholder="Add a deliverable…"
                  />
                  <Button
                    type="submit"
                    disabled={!newDeliverable.trim() || addDeliverable.isPending}
                  >
                    Add
                  </Button>
                </form>
              )}

              {p.deliverables.length === 0 ? (
                <p className="text-sm text-muted-foreground">No deliverables yet.</p>
              ) : (
                <ul className="space-y-2">
                  {p.deliverables.map((d) => (
                    <li
                      key={d.id}
                      className={cn(
                        'flex items-center gap-3 rounded-md border bg-card p-2 text-sm',
                        d.is_done && 'text-muted-foreground',
                      )}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={d.is_done}
                        disabled={!canManage}
                        onChange={(e) =>
                          updateDeliverable.mutate({
                            deliverableId: d.id,
                            body: { is_done: e.target.checked },
                          })
                        }
                      />
                      <span className={cn('flex-1', d.is_done && 'line-through')}>{d.title}</span>
                      {canManage && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeDeliverable.mutate(d.id)}
                        >
                          Remove
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Tasks <span className="text-muted-foreground">({p.tasks_total})</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {p.tasks.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No tasks linked yet.{' '}
                  {canManage && (
                    <Link href="/tasks/new" className="text-primary hover:underline">
                      Create one
                    </Link>
                  )}
                </p>
              ) : (
                <ul className="divide-y">
                  {p.tasks.map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <div className="min-w-0 flex-1">
                        <Link href={`/tasks/${t.id}`} className="font-medium hover:underline">
                          {t.title}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {t.assignee?.full_name ?? 'Unassigned'}
                          {t.due_date && ` · due ${new Date(t.due_date).toLocaleDateString()}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <TaskPriorityBadge priority={t.priority as never} />
                        <TaskStatusBadge status={t.status as never} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {canManage && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Manage</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSave} className="space-y-3">
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as ProjectStatus)}
                    >
                      {PROJECT_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {PROJECT_STATUS_LABELS[s]}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Progress: {progress}%</Label>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={progress}
                      onChange={(e) => setProgress(Number(e.target.value))}
                      className="w-full"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Deadline</Label>
                    <Input
                      type="date"
                      value={deadline}
                      onChange={(e) => setDeadline(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button type="submit" disabled={update.isPending}>
                      {update.isPending ? 'Saving…' : 'Save'}
                    </Button>
                  </div>
                </form>
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
