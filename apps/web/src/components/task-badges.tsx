import type { TaskPriority, TaskStatus } from '@dv-wms/types';
import { Badge } from '@/components/ui/badge';

const STATUS_VARIANTS: Record<TaskStatus, 'default' | 'success' | 'warning' | 'muted' | 'destructive' | 'secondary' | 'outline'> = {
  todo: 'muted',
  in_progress: 'secondary',
  in_review: 'warning',
  completed: 'success',
  blocked: 'destructive',
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  in_review: 'In review',
  completed: 'Completed',
  blocked: 'Blocked',
};

const PRIORITY_VARIANTS: Record<TaskPriority, 'default' | 'success' | 'warning' | 'muted' | 'destructive' | 'secondary' | 'outline'> = {
  low: 'muted',
  medium: 'outline',
  high: 'warning',
  urgent: 'destructive',
};

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return <Badge variant={STATUS_VARIANTS[status]}>{STATUS_LABELS[status]}</Badge>;
}

export function TaskPriorityBadge({ priority }: { priority: TaskPriority }) {
  return (
    <Badge variant={PRIORITY_VARIANTS[priority]} className="capitalize">
      {priority}
    </Badge>
  );
}

export const TASK_STATUS_LABELS = STATUS_LABELS;
