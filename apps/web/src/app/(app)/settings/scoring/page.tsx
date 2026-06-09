'use client';

import { useEffect, useState } from 'react';
import type { PerformanceWeights } from '@dv-wms/types';
import { PageHeader } from '@/components/page-header';
import { FACTOR_LABELS, FACTORS, type FactorKey } from '@/components/performance-badges';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useScoringConfig, useUpdateScoringConfig } from '@/lib/api/config';
import { useAuthStore } from '@/lib/auth-store';

export default function ScoringSettingsPage() {
  const me = useAuthStore((s) => s.user);
  const config = useScoringConfig();
  const update = useUpdateScoringConfig();

  const [weights, setWeights] = useState<PerformanceWeights | null>(null);
  const [staleDays, setStaleDays] = useState(3);
  const [reportCutoff, setReportCutoff] = useState('19:00');
  const [workStart, setWorkStart] = useState('10:00');
  const [scoringDays, setScoringDays] = useState(30);
  const [leadTarget, setLeadTarget] = useState(20);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!config.data) return;
    setWeights(config.data.weights);
    setStaleDays(config.data.stale_lead_days);
    setReportCutoff(config.data.report_cutoff);
    setWorkStart(config.data.work_start_time);
    setScoringDays(config.data.scoring_period_days);
    setLeadTarget(config.data.lead_activity_target);
  }, [config.data]);

  if (me?.role !== 'super_admin') {
    return <p className="text-sm text-muted-foreground">Only the Super Admin can edit scoring.</p>;
  }
  if (!weights) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const sumPct = Math.round(
    FACTORS.reduce((sum, k) => sum + (weights[k] ?? 0) * 100, 0),
  );
  const sumOk = sumPct === 100;

  function setWeight(k: FactorKey, pct: number) {
    setWeights((w) => (w ? { ...w, [k]: pct / 100 } : w));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!sumOk) {
      setError(`Weights must sum to 100% (currently ${sumPct}%)`);
      return;
    }
    try {
      await update.mutateAsync({
        weights: weights!,
        stale_lead_days: staleDays,
        report_cutoff: reportCutoff,
        work_start_time: workStart,
        scoring_period_days: scoringDays,
        lead_activity_target: leadTarget,
      });
      setSuccess('Saved. New weights apply on the next recompute.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Scoring configuration"
        description="Weights and thresholds that drive the performance engine."
      />
      <form onSubmit={handleSave} className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Weights</CardTitle>
            <CardDescription>
              Total: <span className={sumOk ? 'text-emerald-600' : 'text-destructive'}>{sumPct}%</span>
              {!sumOk && ' (must equal 100%)'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {FACTORS.map((k) => {
              const pct = Math.round((weights[k] ?? 0) * 100);
              return (
                <div key={k} className="space-y-2">
                  <div className="flex items-baseline justify-between">
                    <Label>{FACTOR_LABELS[k]}</Label>
                    <span className="text-sm tabular-nums text-muted-foreground">{pct}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={pct}
                    onChange={(e) => setWeight(k, Number(e.target.value))}
                    className="w-full"
                  />
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Thresholds</CardTitle>
            <CardDescription>System-wide defaults that the engine reads.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Scoring period (days)</Label>
              <Input
                type="number"
                min={7}
                max={365}
                value={scoringDays}
                onChange={(e) => setScoringDays(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label>Stale lead (days)</Label>
              <Input
                type="number"
                min={1}
                max={60}
                value={staleDays}
                onChange={(e) => setStaleDays(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label>Report cutoff (HH:mm)</Label>
              <Input
                value={reportCutoff}
                onChange={(e) => setReportCutoff(e.target.value)}
                placeholder="19:00"
              />
            </div>
            <div className="space-y-2">
              <Label>Work start (HH:mm)</Label>
              <Input
                value={workStart}
                onChange={(e) => setWorkStart(e.target.value)}
                placeholder="10:00"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Lead activity target (per period)</Label>
              <Input
                type="number"
                min={1}
                max={500}
                value={leadTarget}
                onChange={(e) => setLeadTarget(Number(e.target.value))}
              />
            </div>
          </CardContent>
        </Card>

        <div className="lg:col-span-2 flex items-center gap-3">
          <Button type="submit" disabled={!sumOk || update.isPending}>
            {update.isPending ? 'Saving…' : 'Save'}
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {success && <p className="text-sm text-emerald-600">{success}</p>}
        </div>
      </form>
    </div>
  );
}
