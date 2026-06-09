import type { ProjectRiskBand } from '@dv-wms/types';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const BAND_VARIANT: Record<ProjectRiskBand, 'success' | 'warning' | 'destructive' | 'muted'> = {
  on_track: 'success',
  at_risk: 'warning',
  off_track: 'destructive',
  stalled: 'destructive',
};

const BAND_LABEL: Record<ProjectRiskBand, string> = {
  on_track: 'On track',
  at_risk: 'At risk',
  off_track: 'Off track',
  stalled: 'Stalled',
};

interface Props {
  score: number | null;
  band: ProjectRiskBand | null;
  scoredAt?: string | null;
  className?: string;
}

export function ProjectRiskBadge({ score, band, scoredAt, className }: Props) {
  if (score === null || band === null) {
    return (
      <Badge variant="outline" className={cn('text-muted-foreground', className)}>
        Unassessed
      </Badge>
    );
  }
  const stale = scoredAt
    ? Date.now() - new Date(scoredAt).getTime() > 7 * 24 * 60 * 60 * 1000
    : false;
  return (
    <Badge
      variant={BAND_VARIANT[band]}
      className={cn('tabular-nums', stale && 'opacity-70', className)}
      title={
        stale && scoredAt
          ? `Assessed ${new Date(scoredAt).toLocaleDateString()} — may be stale`
          : undefined
      }
    >
      {score} · {BAND_LABEL[band]}
    </Badge>
  );
}
