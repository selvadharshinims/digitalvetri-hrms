import type { PerformanceBand } from '@dv-wms/types';
import { Badge } from '@/components/ui/badge';

const VARIANTS: Record<PerformanceBand, 'default' | 'success' | 'warning' | 'muted' | 'destructive' | 'secondary' | 'outline'> = {
  outstanding: 'success',
  strong: 'secondary',
  developing: 'warning',
  needs_support: 'destructive',
};

const LABELS: Record<PerformanceBand, string> = {
  outstanding: 'Outstanding',
  strong: 'Strong',
  developing: 'Developing',
  needs_support: 'Needs support',
};

export function BandBadge({ band }: { band: PerformanceBand }) {
  return <Badge variant={VARIANTS[band]}>{LABELS[band]}</Badge>;
}

export const BAND_LABELS = LABELS;

const FACTOR_LABELS = {
  attendance: 'Attendance',
  task: 'Task completion',
  lead: 'Lead conversion',
  project: 'Project contribution',
  feedback: 'Leader feedback',
  discipline: 'Discipline',
} as const;

export type FactorKey = keyof typeof FACTOR_LABELS;
export const FACTORS: FactorKey[] = [
  'attendance',
  'task',
  'lead',
  'project',
  'feedback',
  'discipline',
];
export { FACTOR_LABELS };

export function ScoreBar({
  score,
  weight,
  label,
}: {
  score: number;
  weight: number;
  label: string;
}) {
  const pct = Math.min(100, Math.max(0, score));
  const contribution = Math.round(weight * score * 10) / 10;
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">
          {Math.round(pct)} · weight {Math.round(weight * 100)}% · +{contribution} pts
        </span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded bg-muted">
        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
