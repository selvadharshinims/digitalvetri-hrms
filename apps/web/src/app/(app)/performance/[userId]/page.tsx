'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { AiAnalysisResponse } from '@dv-wms/types';
import { PageHeader } from '@/components/page-header';
import {
  BandBadge,
  FACTOR_LABELS,
  FACTORS,
  ScoreBar,
} from '@/components/performance-badges';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  useGenerateAiAnalysis,
  useSubmitFeedback,
  useUserFeedback,
  useUserScore,
  useUserScoreHistory,
} from '@/lib/api/performance';
import { useGetUser } from '@/lib/api/users';
import { useAuthStore } from '@/lib/auth-store';
import { cn } from '@/lib/utils';

export default function UserPerformancePage() {
  const params = useParams<{ userId: string }>();
  const me = useAuthStore((s) => s.user);
  const user = useGetUser(params.userId);
  const score = useUserScore(params.userId);
  const history = useUserScoreHistory(params.userId);
  const feedback = useUserFeedback(params.userId);

  const isSelf = me?.id === params.userId;
  const canFeedback = !!me && !isSelf && (me.role === 'super_admin' || me.role === 'team_leader');

  return (
    <div className="space-y-6">
      <PageHeader
        title={user.data?.full_name ?? 'Performance'}
        description={user.data?.email}
        actions={
          <Button variant="outline" asChild>
            <Link href="/performance">Back</Link>
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">Score</CardTitle>
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
          <CardContent className="space-y-3">
            {score.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
            {score.data &&
              FACTORS.map((k) => {
                const weight = score.data!.weights_used[k] ?? 0;
                const value = score.data![`${k}_score` as const];
                return (
                  <div key={k} className={cn(weight === 0 && 'opacity-50')}>
                    <ScoreBar
                      label={FACTOR_LABELS[k] + (weight === 0 ? ' · n/a' : '')}
                      score={Number(value) || 0}
                      weight={weight}
                    />
                  </div>
                );
              })}
          </CardContent>
        </Card>

        <div className="space-y-6">
          {canFeedback && <FeedbackForm userId={params.userId} score={score.data} />}
          <FeedbackHistory items={feedback.data ?? []} />
        </div>
      </div>

      <AnalysisCard userId={params.userId} />
      <TrendCard history={history.data ?? []} />
    </div>
  );
}

function FeedbackForm({
  userId,
  score,
}: {
  userId: string;
  score?: { period_start: string; period_end: string };
}) {
  const submit = useSubmitFeedback();
  const [quality, setQuality] = useState(4);
  const [ownership, setOwnership] = useState(4);
  const [collaboration, setCollaboration] = useState(4);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const periodStart = score?.period_start ?? defaultPeriodStart();
  const periodEnd = score?.period_end ?? new Date().toISOString();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    try {
      await submit.mutateAsync({
        user_id: userId,
        period_start: periodStart.slice(0, 10),
        period_end: periodEnd.slice(0, 10),
        quality,
        ownership,
        collaboration,
        note: note.trim() || undefined,
      });
      setSuccess('Saved.');
      setNote('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Give feedback</CardTitle>
        <CardDescription>1 = needs work, 5 = exceptional. Feeds the score.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Rating label="Quality" value={quality} onChange={setQuality} />
          <Rating label="Ownership" value={ownership} onChange={setOwnership} />
          <Rating label="Collaboration" value={collaboration} onChange={setCollaboration} />
          <div className="space-y-2">
            <Label>Note</Label>
            <Textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional context for the intern…"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {success && <p className="text-sm text-emerald-600">{success}</p>}
          <Button type="submit" disabled={submit.isPending}>
            {submit.isPending ? 'Saving…' : 'Save feedback'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function Rating({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            type="button"
            key={n}
            onClick={() => onChange(n)}
            className={cn(
              'h-9 w-9 rounded-md border text-sm font-medium transition-colors',
              n <= value
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-input bg-background text-muted-foreground hover:bg-accent',
            )}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

function FeedbackHistory({
  items,
}: {
  items: { id: string; period_start: string; period_end: string; quality: number; ownership: number; collaboration: number; note: string | null; leader: { full_name: string } | null }[];
}) {
  if (items.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Feedback history</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {items.map((f) => {
          const avg = ((f.quality + f.ownership + f.collaboration) / 3).toFixed(1);
          return (
            <div key={f.id} className="rounded-md border p-3">
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-medium">{f.leader?.full_name ?? 'Leader'}</p>
                <span className="text-xs text-muted-foreground">
                  {formatDate(f.period_start)} → {formatDate(f.period_end)} · avg {avg}/5
                </span>
              </div>
              <div className="mt-2 grid grid-cols-3 text-xs text-muted-foreground">
                <span>Quality {f.quality}</span>
                <span>Ownership {f.ownership}</span>
                <span>Collab {f.collaboration}</span>
              </div>
              {f.note && <p className="mt-2 whitespace-pre-wrap">{f.note}</p>}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function TrendCard({ history }: { history: { period_end: string; total_score: number }[] }) {
  if (history.length === 0) return null;
  const max = Math.max(...history.map((r) => r.total_score), 100);
  const points = [...history].reverse();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Trend</CardTitle>
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
      </CardContent>
    </Card>
  );
}

function AnalysisCard({ userId }: { userId: string }) {
  const generate = useGenerateAiAnalysis(userId);
  const [result, setResult] = useState<AiAnalysisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setError(null);
    try {
      const r = await generate.mutateAsync();
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'AI analysis failed');
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-base">AI performance analysis</CardTitle>
            <CardDescription>
              A narrative written by Claude based on the current score, the last
              14 daily reports, and the most recent leader feedback.
            </CardDescription>
          </div>
          <Button onClick={handleGenerate} disabled={generate.isPending}>
            {generate.isPending
              ? 'Generating…'
              : result
                ? 'Regenerate'
                : 'Generate analysis'}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!result && !error && (
          <p className="text-sm text-muted-foreground">
            Click "Generate analysis" to produce a narrative. Each generation
            calls Claude — see the cache hit count below to confirm prompt
            caching is working.
          </p>
        )}
        {result && (
          <div className="space-y-4">
            <article className="prose prose-sm max-w-none dark:prose-invert prose-headings:mt-4 prose-headings:mb-2 prose-p:my-2 prose-ol:my-2 prose-li:my-0.5">
              <ReactMarkdown>{result.markdown}</ReactMarkdown>
            </article>
            <div className="flex flex-wrap gap-x-4 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
              <span>Model: {result.model}</span>
              <span>
                Period: {result.period_start.slice(0, 10)} →{' '}
                {result.period_end.slice(0, 10)}
              </span>
              <span>Input tokens: {result.usage.input_tokens}</span>
              <span>Output tokens: {result.usage.output_tokens}</span>
              <span>Cache hit: {result.usage.cache_read_input_tokens}</span>
              {result.usage.cache_creation_input_tokens > 0 && (
                <span>Cache write: {result.usage.cache_creation_input_tokens}</span>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function defaultPeriodStart(): string {
  const d = new Date();
  d.setDate(d.getDate() - 29);
  return d.toISOString();
}

function formatDate(iso: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
