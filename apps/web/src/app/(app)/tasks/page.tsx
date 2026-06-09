'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  type TaskListItem,
  type TaskPriority,
  type TaskStatus,
} from '@dv-wms/types';
import { PageHeader } from '@/components/page-header';
import { TaskPriorityBadge, TaskStatusBadge, TASK_STATUS_LABELS } from '@/components/task-badges';
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
import { useListTasks, useTaskBoard } from '@/lib/api/tasks';
import { useAuthStore } from '@/lib/auth-store';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 25;
const BOARD_COLUMNS: TaskStatus[] = ['todo', 'in_progress', 'in_review', 'completed', 'blocked'];

export default function TasksPage() {
  const me = useAuthStore((s) => s.user);
  const canCreate = me?.role !== 'intern';
  const [view, setView] = useState<'board' | 'list'>('board');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tasks"
        description="Track work across teams, projects, and leads."
        actions={
          <>
            <div className="flex items-center gap-1 rounded-md border bg-card p-1">
              <Button
                variant={view === 'board' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setView('board')}
              >
                Board
              </Button>
              <Button
                variant={view === 'list' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setView('list')}
              >
                List
              </Button>
            </div>
            <Button variant="outline" asChild>
              <Link href="/tasks/mine">My tasks</Link>
            </Button>
            {canCreate && (
              <Button asChild>
                <Link href="/tasks/new">New task</Link>
              </Button>
            )}
          </>
        }
      />

      {view === 'board' ? <BoardView /> : <ListView />}
    </div>
  );
}

function BoardView() {
  const board = useTaskBoard();
  return (
    <div className="grid gap-4 lg:grid-cols-5">
      {BOARD_COLUMNS.map((col) => {
        const items = board.data?.[col] ?? [];
        return (
          <div key={col} className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <TaskStatusBadge status={col} />
              <span className="text-xs text-muted-foreground">{items.length}</span>
            </div>
            <div className="space-y-2 rounded-lg border bg-muted/30 p-2 min-h-[12rem]">
              {board.isLoading && (
                <p className="px-1 text-xs text-muted-foreground">Loading…</p>
              )}
              {items.length === 0 && !board.isLoading && (
                <p className="px-1 text-xs text-muted-foreground">No tasks.</p>
              )}
              {items.map((t) => (
                <TaskCard key={t.id} task={t} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TaskCard({ task }: { task: TaskListItem }) {
  return (
    <Link
      href={`/tasks/${task.id}`}
      className={cn(
        'block rounded-md border bg-background p-3 text-sm transition-colors hover:border-foreground/30',
        task.is_overdue && 'border-destructive/40',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium leading-tight">{task.title}</p>
        <TaskPriorityBadge priority={task.priority} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        {task.assignee ? (
          <span>{task.assignee.full_name}</span>
        ) : (
          <span className="italic">Unassigned</span>
        )}
        {task.project && (
          <>
            <span>·</span>
            <span>{task.project.name}</span>
          </>
        )}
        {task.due_date && (
          <>
            <span>·</span>
            <span className={cn(task.is_overdue && 'text-destructive')}>
              {new Date(task.due_date).toLocaleDateString()}
            </span>
          </>
        )}
      </div>
      {task.status === 'in_progress' && (
        <div className="mt-2 h-1 w-full overflow-hidden rounded bg-muted">
          <div
            className="h-full bg-primary"
            style={{ width: `${Math.min(100, Math.max(0, task.progress_pct))}%` }}
          />
        </div>
      )}
    </Link>
  );
}

function ListView() {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<TaskStatus | ''>('');
  const [priority, setPriority] = useState<TaskPriority | ''>('');
  const [overdue, setOverdue] = useState(false);

  const list = useListTasks({
    page,
    limit: PAGE_SIZE,
    q: q || undefined,
    status: status || undefined,
    priority: priority || undefined,
    overdue: overdue || undefined,
  });

  const totalPages = list.data ? Math.max(1, Math.ceil(list.data.meta.total / PAGE_SIZE)) : 1;

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="grid gap-3 sm:grid-cols-[1fr,160px,160px,auto]">
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
              setStatus(e.target.value as TaskStatus | '');
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            {TASK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {TASK_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
          <Select
            value={priority}
            onChange={(e) => {
              setPriority(e.target.value as TaskPriority | '');
              setPage(1);
            }}
          >
            <option value="">All priorities</option>
            {TASK_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
          <Button
            variant={overdue ? 'default' : 'outline'}
            onClick={() => {
              setOverdue((v) => !v);
              setPage(1);
            }}
          >
            Overdue only
          </Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Task</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Assignee</TableHead>
              <TableHead>Due</TableHead>
              <TableHead className="text-right">Progress</TableHead>
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
            {list.data?.data.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No tasks match these filters.
                </TableCell>
              </TableRow>
            )}
            {list.data?.data.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium">
                  <Link href={`/tasks/${t.id}`} className="hover:underline">
                    {t.title}
                  </Link>
                  {(t.project || t.lead) && (
                    <p className="text-xs text-muted-foreground">
                      {t.project ? `Project: ${t.project.name}` : `Lead: ${t.lead?.name}`}
                    </p>
                  )}
                </TableCell>
                <TableCell>
                  <TaskStatusBadge status={t.status} />
                </TableCell>
                <TableCell>
                  <TaskPriorityBadge priority={t.priority} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {t.assignee?.full_name ?? <span className="italic">Unassigned</span>}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {t.due_date ? (
                    <span className={t.is_overdue ? 'text-destructive' : undefined}>
                      {new Date(t.due_date).toLocaleDateString()}
                      {t.is_overdue && <Badge variant="destructive" className="ml-2">overdue</Badge>}
                    </span>
                  ) : (
                    '—'
                  )}
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {t.progress_pct}%
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
  );
}
