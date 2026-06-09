import type { TicketPriority, TicketStatus, TicketType } from '@dv-wms/types';
import { Badge } from '@/components/ui/badge';

const STATUS_VARIANTS: Record<TicketStatus, 'default' | 'success' | 'warning' | 'muted' | 'destructive' | 'secondary' | 'outline'> = {
  open: 'warning',
  in_progress: 'secondary',
  resolved: 'success',
  closed: 'muted',
};

const STATUS_LABELS: Record<TicketStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  resolved: 'Resolved',
  closed: 'Closed',
};

const PRIORITY_VARIANTS: Record<TicketPriority, 'default' | 'success' | 'warning' | 'muted' | 'destructive' | 'secondary' | 'outline'> = {
  low: 'muted',
  medium: 'outline',
  high: 'warning',
  urgent: 'destructive',
};

const TYPE_LABELS: Record<TicketType, string> = {
  technical: 'Technical',
  leave_request: 'Leave request',
  project_support: 'Project support',
  access_request: 'Access',
  general: 'General',
};

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  return <Badge variant={STATUS_VARIANTS[status]}>{STATUS_LABELS[status]}</Badge>;
}

export function TicketPriorityBadge({ priority }: { priority: TicketPriority }) {
  return (
    <Badge variant={PRIORITY_VARIANTS[priority]} className="capitalize">
      {priority}
    </Badge>
  );
}

export function TicketTypeBadge({ type }: { type: TicketType }) {
  return <Badge variant="outline">{TYPE_LABELS[type]}</Badge>;
}

export const TICKET_STATUS_LABELS = STATUS_LABELS;
export const TICKET_TYPE_LABELS = TYPE_LABELS;
