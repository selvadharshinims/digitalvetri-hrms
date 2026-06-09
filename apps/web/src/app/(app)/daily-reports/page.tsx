'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  useListReports,
  useMyReport,
  useSubmitReport,
} from '@/lib/api/daily-reports';
import { useAuthStore } from '@/lib/auth-store';

export default function DailyReportsPage() {
  const me = useAuthStore((s) => s.user);
  if (!me) return null;
  const isLeader = me.role !== 'intern';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Daily reports"
        description="A short reflection at the end of each working day."
        actions={
          isLeader && (
            <Button variant="outline" asChild>
              <Link href="/daily-reports/missing">Missing reports</Link>
            </Button>
          )
        }
      />

      <TodayForm />
      {isLeader && <PendingReviewQueue />}
      <RecentList />
    </div>
  );
}

function TodayForm() {
  const mine = useMyReport();
  const submit = useSubmitReport();
  const [todays, setTodays] = useState('');
  const [challenges, setChallenges] = useState('');
  const [learnings, setLearnings] = useState('');
  const [tomorrow, setTomorrow] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!mine.data) return;
    setTodays(mine.data.todays_work ?? '');
    setChallenges(mine.data.challenges ?? '');
    setLearnings(mine.data.learnings ?? '');
    setTomorrow(mine.data.tomorrows_plan ?? '');
  }, [mine.data]);

  const alreadyLocked = mine.data?.is_locked === true;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    try {
      await submit.mutateAsync({
        report_date: new Date().toISOString().slice(0, 10),
        todays_work: todays.trim(),
        challenges: challenges.trim() || undefined,
        learnings: learnings.trim() || undefined,
        tomorrows_plan: tomorrow.trim() || undefined,
      });
      setSuccess(mine.data ? 'Updated.' : 'Submitted.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed');
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Today's report</CardTitle>
            <CardDescription>
              {new Date().toLocaleDateString(undefined, {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}
            </CardDescription>
          </div>
          {mine.data?.submitted_late && <Badge variant="warning">Submitted late</Badge>}
          {alreadyLocked && <Badge variant="muted">Locked</Badge>}
        </div>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          <Field label="What did you do today? *">
            <Textarea
              rows={4}
              value={todays}
              onChange={(e) => setTodays(e.target.value)}
              required
              disabled={alreadyLocked}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Challenges faced">
              <Textarea
                rows={3}
                value={challenges}
                onChange={(e) => setChallenges(e.target.value)}
                disabled={alreadyLocked}
              />
            </Field>
            <Field label="What I learned">
              <Textarea
                rows={3}
                value={learnings}
                onChange={(e) => setLearnings(e.target.value)}
                disabled={alreadyLocked}
              />
            </Field>
          </div>
          <Field label="Plan for tomorrow">
            <Textarea
              rows={3}
              value={tomorrow}
              onChange={(e) => setTomorrow(e.target.value)}
              disabled={alreadyLocked}
            />
          </Field>

          {mine.data?.reviewed_at && (
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                Reviewed by {mine.data.reviewer?.full_name ?? 'leader'} on{' '}
                {new Date(mine.data.reviewed_at).toLocaleString()}
              </p>
              {mine.data.review_note && <p className="mt-1">{mine.data.review_note}</p>}
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
          {success && <p className="text-sm text-emerald-600">{success}</p>}

          <Button
            type="submit"
            size="lg"
            className="h-12 w-full text-base sm:w-auto"
            disabled={alreadyLocked || submit.isPending || !todays.trim()}
          >
            {submit.isPending ? 'Saving…' : mine.data ? 'Update report' : 'Submit report'}
          </Button>
        </CardContent>
      </form>
    </Card>
  );
}

function PendingReviewQueue() {
  const list = useListReports({ pending_review: true, limit: 20 });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Pending review</CardTitle>
        <CardDescription>Reports your team submitted that you haven't acknowledged.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {list.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {list.data?.data.length === 0 && (
          <p className="text-sm text-muted-foreground">All caught up.</p>
        )}
        {list.data?.data.map((r) => (
          <Link
            key={r.id}
            href={`/daily-reports/${r.id}`}
            className="block rounded-md border bg-card p-3 hover:border-foreground/30"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium">{r.author?.full_name ?? 'Unknown'}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(r.report_date).toLocaleDateString()} ·{' '}
                  {r.submitted_late ? 'Submitted late' : 'Submitted on time'}
                </p>
              </div>
              <Badge variant="warning">Needs review</Badge>
            </div>
            <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{r.todays_work}</p>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

function RecentList() {
  const me = useAuthStore((s) => s.user);
  const [q, setQ] = useState('');
  const list = useListReports({
    user_id: me?.role === 'intern' ? me.id : undefined,
    q: q || undefined,
    limit: 25,
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base">Recent reports</CardTitle>
            <CardDescription>
              {me?.role === 'intern' ? 'Your past reports.' : 'Team activity.'}
            </CardDescription>
          </div>
          <Input
            placeholder="Search content…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="sm:max-w-[280px]"
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {list.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {list.data?.data.length === 0 && (
          <p className="text-sm text-muted-foreground">No reports yet.</p>
        )}
        {list.data?.data.map((r) => (
          <Link
            key={r.id}
            href={`/daily-reports/${r.id}`}
            className="block rounded-md border bg-card p-3 hover:border-foreground/30"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium">
                  {new Date(r.report_date).toLocaleDateString(undefined, {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                  })}
                  {me?.role !== 'intern' && ` · ${r.author?.full_name ?? 'Unknown'}`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {r.is_locked ? 'Locked' : 'Editable'}
                  {r.reviewed_at && ` · Reviewed`}
                  {r.submitted_late && ` · Late`}
                </p>
              </div>
            </div>
            <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{r.todays_work}</p>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
