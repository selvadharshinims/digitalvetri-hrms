'use client';

import Link from 'next/link';
import { PageHeader } from '@/components/page-header';
import { TaskPriorityBadge, TaskStatusBadge } from '@/components/task-badges';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useMyTasks } from '@/lib/api/tasks';
import { cn } from '@/lib/utils';

export default function MyTasksPage() {
  const tasks = useMyTasks();

  return (
    <div className="space-y-6">
      <PageHeader
        title="My tasks"
        description="Everything assigned to you, across every team."
        actions={
          <Button variant="outline" asChild>
            <Link href="/tasks">All tasks</Link>
          </Button>
        }
      />

      {tasks.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {tasks.isError && (
        <p className="text-sm text-destructive">{(tasks.error as Error).message}</p>
      )}

      {tasks.data && tasks.data.length === 0 && (
        <Card>
          <CardContent className="pt-6 text-center text-sm text-muted-foreground">
            Nothing on your plate right now. Nice work.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3">
        {tasks.data?.map((t) => (
          <Link key={t.id} href={`/tasks/${t.id}`} className="block">
            <Card
              className={cn(
                'transition-colors hover:border-foreground/30',
                t.is_overdue && 'border-destructive/40',
              )}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">{t.title}</CardTitle>
                    {(t.project || t.lead) && (
                      <p className="text-xs text-muted-foreground">
                        {t.project ? `Project: ${t.project.name}` : `Lead: ${t.lead?.name}`}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <TaskStatusBadge status={t.status} />
                    <TaskPriorityBadge priority={t.priority} />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center gap-2 pt-2 text-xs text-muted-foreground">
                {t.due_date && (
                  <Badge variant={t.is_overdue ? 'destructive' : 'muted'}>
                    {t.is_overdue ? 'Overdue · ' : 'Due '}
                    {new Date(t.due_date).toLocaleDateString()}
                  </Badge>
                )}
                <span>{t.progress_pct}% done</span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
