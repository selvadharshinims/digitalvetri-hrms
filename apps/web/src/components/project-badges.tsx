import type { DeadlineRisk, ProjectStatus } from '@dv-wms/types';
import { Badge } from '@/components/ui/badge';

const STATUS_VARIANTS: Record<ProjectStatus, 'default' | 'success' | 'warning' | 'muted' | 'destructive' | 'secondary' | 'outline'> = {
  planning: 'muted',
  in_progress: 'secondary',
  on_hold: 'warning',
  completed: 'success',
  cancelled: 'destructive',
};

const STATUS_LABELS: Record<ProjectStatus, string> = {
  planning: 'Planning',
  in_progress: 'In progress',
  on_hold: 'On hold',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  return <Badge variant={STATUS_VARIANTS[status]}>{STATUS_LABELS[status]}</Badge>;
}

export const PROJECT_STATUS_LABELS = STATUS_LABELS;

export function DeadlineBadge({ deadline, risk }: { deadline: string | null; risk: DeadlineRisk }) {
  if (!deadline) return null;
  const date = new Date(deadline).toLocaleDateString();
  if (risk === 'overdue') {
    return <Badge variant="destructive">Overdue · {date}</Badge>;
  }
  if (risk === 'approaching') {
    return <Badge variant="warning">Due soon · {date}</Badge>;
  }
  return <Badge variant="muted">Due {date}</Badge>;
}
