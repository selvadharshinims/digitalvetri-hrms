'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { TASK_PRIORITIES, type TaskPriority } from '@dv-wms/types';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useCreateTask } from '@/lib/api/tasks';
import { useListUsers } from '@/lib/api/users';
import { useAuthStore } from '@/lib/auth-store';

export default function NewTaskPage() {
  const router = useRouter();
  const me = useAuthStore((s) => s.user);
  const create = useCreateTask();
  const users = useListUsers({ status: 'active', limit: 100 });

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [filter, setFilter] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState<string | null>(null);

  const allUsers = users.data?.data ?? [];
  const filteredUsers = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return allUsers;
    return allUsers.filter((u) => u.full_name.toLowerCase().includes(q));
  }, [allUsers, filter]);

  if (me?.role === 'intern') {
    return <p className="text-sm text-muted-foreground">Interns cannot create tasks directly.</p>;
  }

  function toggleAssignee(id: string) {
    setAssigneeIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function toggleAllVisible() {
    const visibleIds = filteredUsers.map((u) => u.id);
    const allSelected = visibleIds.every((id) => assigneeIds.includes(id));
    setAssigneeIds((prev) =>
      allSelected
        ? prev.filter((id) => !visibleIds.includes(id))
        : Array.from(new Set([...prev, ...visibleIds])),
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const basePayload = {
      title: title.trim(),
      description: description.trim() || undefined,
      priority,
      due_date: dueDate || undefined,
    };
    try {
      if (assigneeIds.length <= 1) {
        const task = await create.mutateAsync({
          ...basePayload,
          assignee_id: assigneeIds[0] || undefined,
        });
        router.push(`/tasks/${task.id}`);
        return;
      }
      await Promise.all(
        assigneeIds.map((id) =>
          create.mutateAsync({ ...basePayload, assignee_id: id }),
        ),
      );
      router.push('/tasks');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    }
  }

  const visibleIds = filteredUsers.map((u) => u.id);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => assigneeIds.includes(id));

  return (
    <div className="space-y-6">
      <PageHeader title="New task" description="Assign work to an intern or leader." />
      <Card className="max-w-2xl">
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4 pt-6">
            <div className="space-y-2">
              <Label>Title *</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What needs to be done, success criteria, references…"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label>
                  Assignees{' '}
                  <span className="text-xs font-normal text-muted-foreground">
                    {assigneeIds.length > 0
                      ? `(${assigneeIds.length} selected — one task per person)`
                      : '(leave empty for unassigned)'}
                  </span>
                </Label>
                <button
                  type="button"
                  onClick={toggleAllVisible}
                  className="text-xs text-primary hover:underline disabled:opacity-50"
                  disabled={visibleIds.length === 0}
                >
                  {allVisibleSelected ? 'Clear visible' : 'Select all visible'}
                </button>
              </div>
              <Input
                placeholder="Filter people…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
              <div className="max-h-56 overflow-y-auto rounded-md border border-input bg-background p-2">
                {filteredUsers.length === 0 ? (
                  <p className="px-1 py-2 text-sm text-muted-foreground">No people match.</p>
                ) : (
                  <ul className="space-y-1">
                    {filteredUsers.map((u) => {
                      const checked = assigneeIds.includes(u.id);
                      return (
                        <li key={u.id}>
                          <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleAssignee(u.id)}
                              className="h-4 w-4"
                            />
                            <span>{u.full_name}</span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
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
                <Label>Due date</Label>
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex gap-2">
              <Button type="submit" disabled={create.isPending}>
                {create.isPending
                  ? 'Creating…'
                  : assigneeIds.length > 1
                    ? `Create ${assigneeIds.length} tasks`
                    : 'Create task'}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.back()}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </form>
      </Card>
    </div>
  );
}
