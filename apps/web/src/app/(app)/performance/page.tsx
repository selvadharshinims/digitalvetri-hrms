'use client';

import Link from 'next/link';
import { PageHeader } from '@/components/page-header';
import {
  BandBadge,
  FACTOR_LABELS,
  FACTORS,
  ScoreBar,
  type FactorKey,
} from '@/components/performance-badges';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  useLeaderboard,
  useMyScore,
  useMyScoreHistory,
  useRecomputePerformance,
} from '@/lib/api/performance';
import { useAuthStore } from '@/lib/auth-store';
import { cn } from '@/lib/utils';

export default function PerformancePage() {
  const me = useAuthStore((s) => s.user);
  if (!me) return null;
  const isAdmin = me.role === 'super_admin';
  const isLeader = me.role !== 'intern';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Performance"
        description="Transparent scoring across attendance, work, leads, projects, feedback, and discipline."
        actions={isAdmin && <RecomputeButton />}
      />

      <MyScoreCard />
      {isLeader && <LeaderboardSection />}
      <MyHistoryCard />
    </div>
  );
}

function RecomputeButton() {
  const recompute = useRecomputePerformance();
  return (
    <Button
      variant="outline"
      onClick={() => recompute.mutate()}
      disabled={recompute.isPending}
    >
      {recompute.isPending ? 'Recomputing…' : 'Recompute now'}
    </Button>
  );
}

function MyScoreCard() {
  const score = useMyScore();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">My current score</CardTitle>
            <CardDescription>
              {score.data
                ? `${formatDate(score.data.period_start)} → ${formatDate(score.data.period_end)}`
                : 'Rolling window'}
            </CardDescription>
          </div>
          {score.data && (
            <div className="text-right">
              <p className="text-4xl font-semibold leading-none">{score.data.total_score}</p>
              <div className="mt-2">
                <BandBadge band={score.data.band} />
              </div>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {score.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {score.data && (
          <div className="space-y-3">
            {FACTORS.map((k: FactorKey) => {
              const weight = score.data!.weights_used[k] ?? 0;
              const component = score.data![`${k}_score` as const];
              const active = weight > 0;
              return (
                <div key={k} className={cn(!active && 'opacity-50')}>
                  <ScoreBar
                    label={FACTOR_LABELS[k] + (active ? '' : ' · n/a')}
                    score={Number(component) || 0}
                    weight={weight}
                  />
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LeaderboardSection() {
  const board = useLeaderboard({ limit: 25 });
  const me = useAuthStore((s) => s.user);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Leaderboard</CardTitle>
        <CardDescription>
          Ranked by total score · ties broken by task then lead contribution.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {board.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {board.data?.length === 0 && (
          <p className="text-sm text-muted-foreground">No scores yet.</p>
        )}
        <ol className="space-y-2">
          {board.data?.map((row) => (
            <li
              key={row.user_id}
              className={cn(
                'flex items-center justify-between gap-3 rounded-md border bg-card px-3 py-2 text-sm',
                row.user_id === me?.id && 'border-foreground/40 bg-accent/40',
              )}
            >
              <div className="flex items-center gap-3">
                <span className="w-6 text-right text-muted-foreground">#{row.rank}</span>
                <Link href={`/performance/${row.user_id}`} className="font-medium hover:underline">
                  {row.full_name}
                </Link>
                <BandBadge band={row.band} />
              </div>
              <span className="text-xl font-semibold tabular-nums">{row.total_score}</span>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

function MyHistoryCard() {
  const history = useMyScoreHistory();
  if (!history.data || history.data.length === 0) return null;
  const max = Math.max(...history.data.map((r) => r.total_score), 100);
  const points = [...history.data].reverse();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">My trend</CardTitle>
        <CardDescription>Total score over recent periods.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-1 h-32">
          {points.map((p) => (
            <div
              key={p.period_end}
              className="flex-1 rounded-t bg-primary/70"
              title={`${formatDate(p.period_end)} — ${p.total_score}`}
              style={{ height: `${Math.max(4, (p.total_score / max) * 100)}%` }}
            />
          ))}
        </div>
        <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
          <span>{formatDate(points[0]?.period_end ?? '')}</span>
          <span>{formatDate(points[points.length - 1]?.period_end ?? '')}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function formatDate(iso: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
