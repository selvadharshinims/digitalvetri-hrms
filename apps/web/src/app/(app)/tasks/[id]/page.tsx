'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  type TaskPriority,
  type TaskStatus,
} from '@dv-wms/types';
import { PageHeader } from '@/components/page-header';
import { TaskPriorityBadge, TaskStatusBadge, TASK_STATUS_LABELS } from '@/components/task-badges';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  useCommentTask,
  useGetTask,
  useReviewTask,
  useUpdateTask,
} from '@/lib/api/tasks';
import { useListUsers } from '@/lib/api/users';
import { useAuthStore } from '@/lib/auth-store';

export default function TaskDetailPage() {
  const params = useParams<{ id: string }>();
  const me = useAuthStore((s) => s.user);
  const task = useGetTask(params.id);
  const users = useListUsers({ status: 'active', limit: 100 });

  const update = useUpdateTask(params.id);
  const review = useReviewTask(params.id);
  const comment = useCommentTask(params.id);

  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<TaskStatus>('todo');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [blockReason, setBlockReason] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [commentBody, setCommentBody] = useState('');
  const [reviewFeedback, setReviewFeedback] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!task.data) return;
    setProgress(task.data.progress_pct);
    setStatus(task.data.status);
    setPriority(task.data.priority);
    setBlockReason(task.data.block_reason ?? '');
    setAssigneeId(task.data.assignee_id ?? '');
    setDueDate(task.data.due_date ? task.data.due_date.slice(0, 10) : '');
  }, [task.data]);

  if (task.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (task.isError || !task.data) {
    return <p className="text-sm text-destructive">{(task.error as Error)?.message ?? 'Not found'}</p>;
  }

  const t = task.data;
  const isAssignee = t.assignee_id === me?.id;
  const isAdmin = me?.role === 'super_admin';
  const isLeaderOfTeam =
    me?.role === 'team_leader' &&
    (t.project ? me.led_team_ids.includes(t.project.team_id) : false);
  const canEditFull = isAdmin || isLeaderOfTeam || t.created_by === me?.id;
  const canEdit = canEditFull || isAssignee;
  const canReview = !!me && t.status === 'in_review' && !isAssignee && (isAdmin || isLeaderOfTeam || t.created_by === me.id);

  // Assignees can't move directly to completed — submit forces in_review.
  const allowedStatuses: TaskStatus[] = isAssignee && !canEditFull
    ? TASK_STATUSES.filter((s) => s !== 'completed')
    : [...TASK_STATUSES];

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const body: Record<string, unknown> = {};
      if (progress !== t.progress_pct) body.progress_pct = progress;
      if (status !== t.status) body.status = status;
      if (canEditFull) {
        if (priority !== t.priority) body.priority = priority;
        if ((assigneeId || null) !== (t.assignee_id || null))
          body.assignee_id = assigneeId || undefined;
        if (dueDate && dueDate !== (t.due_date?.slice(0, 10) ?? ''))
          body.due_date = dueDate;
      }
      if (status === 'blocked' && blockReason.trim() && blockReason !== (t.block_reason ?? '')) {
        body.block_reason = blockReason.trim();
      }
      if (Object.keys(body).length === 0) return;
      await update.mutateAsync(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    }
  }

  async function handleSubmitForReview() {
    setError(null);
    try {
      await update.mutateAsync({ status: 'in_review' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submit failed');
    }
  }

  async function handleReview(decision: 'approve' | 'reopen') {
    setError(null);
    try {
      await review.mutateAsync({
        decision,
        feedback: reviewFeedback.trim() || undefined,
      });
      setReviewFeedback('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Review failed');
    }
  }

  async function handleComment(e: React.FormEvent) {
    e.preventDefault();
    if (!commentBody.trim()) return;
    try {
      await comment.mutateAsync({ note: commentBody.trim() });
      setCommentBody('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Comment failed');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.title}
        description={t.creator ? `Created by ${t.creator.full_name}` : undefined}
        actions={
          <Button variant="outline" asChild>
            <Link href="/tasks">Back</Link>
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
                <TaskStatusBadge status={t.status} />
                <TaskPriorityBadge priority={t.priority} />
                {t.is_overdue && <Badge variant="destructive">Overdue</Badge>}
                {t.project && (
                  <Badge variant="muted">
                    Project: <Link href={`/projects/${t.project.id}`} className="ml-1 hover:underline">{t.project.name}</Link>
                  </Badge>
                )}
                {t.lead && (
                  <Badge variant="muted">
                    Lead: <Link href={`/leads/${t.lead.id}`} className="ml-1 hover:underline">{t.lead.name}</Link>
                  </Badge>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Assignee" value={t.assignee?.full_name ?? 'Unassigned'} />
                <Field label="Due date" value={t.due_date ? new Date(t.due_date).toLocaleDateString() : null} />
                <Field
                  label="Completed at"
                  value={t.completed_at ? new Date(t.completed_at).toLocaleString() : null}
                />
                <Field label="Created" value={new Date(t.created_at).toLocaleString()} />
              </div>

              {t.description && (
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Description</p>
                  <p className="mt-1 whitespace-pre-wrap">{t.description}</p>
                </div>
              )}
              {t.block_reason && t.status === 'blocked' && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
                  <p className="text-xs uppercase tracking-wider text-destructive">Blocked</p>
                  <p className="mt-1 text-sm">{t.block_reason}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {canEdit && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Update</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSave} className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as TaskStatus)}
                    >
                      {allowedStatuses.map((s) => (
                        <option key={s} value={s}>
                          {TASK_STATUS_LABELS[s]}
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
                  {canEditFull && (
                    <>
                      <div className="space-y-2">
                        <Label>Priority</Label>
                        <Select
                          value={priority}
                          onChange={(e) => setPriority(e.target.value as TaskPriority)}
                        >
                          {TASK_PRIORITIES.map((p) => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Assignee</Label>
                        <Select
                          value={assigneeId}
                          onChange={(e) => setAssigneeId(e.target.value)}
                        >
                          <option value="">Unassigned</option>
                          {users.data?.data.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.full_name}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <Label>Due date</Label>
                        <Input
                          type="date"
                          value={dueDate}
                          onChange={(e) => setDueDate(e.target.value)}
                        />
                      </div>
                    </>
                  )}
                  {status === 'blocked' && (
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Block reason *</Label>
                      <Textarea
                        rows={2}
                        value={blockReason}
                        onChange={(e) => setBlockReason(e.target.value)}
                        required
                      />
                    </div>
                  )}
                  <div className="flex flex-col gap-2 sm:col-span-2 sm:flex-row">
                    <Button
                      type="submit"
                      size="lg"
                      className="h-12 w-full text-base sm:w-auto"
                      disabled={update.isPending}
                    >
                      {update.isPending ? 'Saving…' : 'Save changes'}
                    </Button>
                    {isAssignee && !canEditFull && t.status !== 'in_review' && t.status !== 'completed' && (
                      <Button
                        type="button"
                        size="lg"
                        className="h-12 w-full text-base sm:w-auto"
                        variant="secondary"
                        onClick={handleSubmitForReview}
                        disabled={update.isPending}
                      >
                        Submit for review
                      </Button>
                    )}
                  </div>
                </form>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          {canReview && (
            <Card className="border-warning/40">
              <CardHeader>
                <CardTitle className="text-base">Review</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  rows={3}
                  placeholder="Feedback for the assignee…"
                  value={reviewFeedback}
                  onChange={(e) => setReviewFeedback(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button onClick={() => handleReview('approve')} disabled={review.isPending}>
                    Approve
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handleReview('reopen')}
                    disabled={review.isPending}
                  >
                    Reopen
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Activity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <form onSubmit={handleComment} className="space-y-2">
                <Textarea
                  rows={2}
                  placeholder="Add a comment…"
                  value={commentBody}
                  onChange={(e) => setCommentBody(e.target.value)}
                />
                <Button type="submit" size="sm" disabled={!commentBody.trim() || comment.isPending}>
                  {comment.isPending ? 'Posting…' : 'Post comment'}
                </Button>
              </form>

              {t.activities.length === 0 ? (
                <p className="text-sm text-muted-foreground">No activity yet.</p>
              ) : (
                <ol className="space-y-3">
                  {t.activities.map((a) => (
                    <li key={a.id} className="border-l pl-3">
                      <p className="text-xs text-muted-foreground">
                        {new Date(a.created_at).toLocaleString()}
                      </p>
                      <p className="text-sm">
                        <span className="font-medium capitalize">{a.action.replace('_', ' ')}</span>
                      </p>
                      {a.note && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{a.note}</p>}
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

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5">{value || <span className="text-muted-foreground">—</span>}</p>
    </div>
  );
}
