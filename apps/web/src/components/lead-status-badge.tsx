import type { LeadStatus } from '@dv-wms/types';
import { Badge } from '@/components/ui/badge';

const VARIANTS: Record<LeadStatus, 'default' | 'success' | 'warning' | 'muted' | 'destructive' | 'secondary'> = {
  new: 'muted',
  contacted: 'secondary',
  interested: 'default',
  follow_up: 'warning',
  converted: 'success',
  lost: 'muted',
  invalid: 'destructive',
};

const LABELS: Record<LeadStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  interested: 'Interested',
  follow_up: 'Follow up',
  converted: 'Converted',
  lost: 'Lost',
  invalid: 'Invalid',
};

export function LeadStatusBadge({ status }: { status: LeadStatus }) {
  return <Badge variant={VARIANTS[status]}>{LABELS[status]}</Badge>;
}
