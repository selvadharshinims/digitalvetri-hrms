import type { AiScoreBand } from '@dv-wms/types';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const BAND_VARIANT: Record<AiScoreBand, 'success' | 'warning' | 'muted' | 'destructive'> = {
  hot: 'success',
  warm: 'warning',
  cold: 'muted',
  invalid: 'destructive',
};

const BAND_LABEL: Record<AiScoreBand, string> = {
  hot: 'Hot',
  warm: 'Warm',
  cold: 'Cold',
  invalid: 'Invalid',
};

interface Props {
  score: number | null;
  band: AiScoreBand | null;
  scoredAt?: string | null;
  className?: string;
}

export function LeadScoreBadge({ score, band, scoredAt, className }: Props) {
  if (score === null || band === null) {
    return (
      <Badge variant="outline" className={cn('text-muted-foreground', className)}>
        Unscored
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
        stale
          ? `Scored ${scoredAt ? new Date(scoredAt).toLocaleDateString() : ''} — may be stale`
          : undefined
      }
    >
      {score} · {BAND_LABEL[band]}
    </Badge>
  );
}
