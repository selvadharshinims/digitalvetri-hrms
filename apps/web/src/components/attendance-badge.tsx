import type { AttendanceStatus } from '@dv-wms/types';
import { Badge } from '@/components/ui/badge';

const VARIANTS: Record<AttendanceStatus, 'default' | 'success' | 'warning' | 'muted' | 'destructive' | 'secondary' | 'outline'> = {
  present: 'success',
  late: 'warning',
  half_day: 'secondary',
  leave: 'muted',
  absent: 'destructive',
};

const LABELS: Record<AttendanceStatus, string> = {
  present: 'Present',
  late: 'Late',
  half_day: 'Half day',
  leave: 'Leave',
  absent: 'Absent',
};

export function AttendanceBadge({ status }: { status: AttendanceStatus | null }) {
  if (!status) return <Badge variant="muted">No mark</Badge>;
  return <Badge variant={VARIANTS[status]}>{LABELS[status]}</Badge>;
}

export const ATTENDANCE_LABELS = LABELS;
