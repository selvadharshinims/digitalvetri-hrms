'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useGetReport, useReviewReport } from '@/lib/api/daily-reports';
import { useAuthStore } from '@/lib/auth-store';

export default function DailyReportDetailPage() {
  const params = useParams<{ id: string }>();
  const me = useAuthStore((s) => s.user);
  const report = useGetReport(params.id);
  const review = useReviewReport(params.id);

  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (report.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (report.isError || !report.data) {
    return <p className="text-sm text-destructive">{(report.error as Error)?.message ?? 'Not found'}</p>;
  }

  const r = report.data;
  const isOwn = r.user_id === me?.id;
  const canReview =
    !!me && !isOwn && (me.role === 'super_admin' || me.role === 'team_leader');

  async function handleReview(acknowledged: boolean) {
    setError(null);
    try {
      await review.mutateAsync({
        acknowledged,
        review_note: note.trim() || undefined,
      });
      setNote('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Review failed');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Report — ${new Date(r.report_date).toLocaleDateString()}`}
        description={r.author?.full_name ?? undefined}
        actions={
          <Button variant="outline" asChild>
            <Link href="/daily-reports">Back</Link>
          </Button>
        }
      />

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-base">Report</CardTitle>
                {r.is_locked && <Badge variant="muted">Locked</Badge>}
                {r.submitted_late && <Badge variant="warning">Submitted late</Badge>}
                {r.reviewed_at && <Badge variant="success">Reviewed</Badge>}
              </div>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <Section title="Today's work" body={r.todays_work} />
              {r.challenges && <Section title="Challenges faced" body={r.challenges} />}
              {r.learnings && <Section title="What I learned" body={r.learnings} />}
              {r.tomorrows_plan && <Section title="Plan for tomorrow" body={r.tomorrows_plan} />}
              <p className="pt-2 text-xs text-muted-foreground">
                Submitted {new Date(r.created_at).toLocaleString()}
                {r.updated_at !== r.created_at && ` · last edited ${new Date(r.updated_at).toLocaleString()}`}
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {r.reviewed_at && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Reviewer note</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="text-xs text-muted-foreground">
                  {r.reviewer?.full_name ?? 'Reviewer'} · {new Date(r.reviewed_at).toLocaleString()}
                </p>
                {r.review_note ? (
                  <p className="whitespace-pre-wrap">{r.review_note}</p>
                ) : (
                  <p className="text-muted-foreground italic">Acknowledged without note.</p>
                )}
              </CardContent>
            </Card>
          )}

          {canReview && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Review</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  rows={4}
                  placeholder="Optional feedback for the author…"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button onClick={() => handleReview(true)} disabled={review.isPending}>
                    Acknowledge
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handleReview(false)}
                    disabled={review.isPending || !note.trim()}
                  >
                    Save note only
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{title}</p>
      <p className="mt-1 whitespace-pre-wrap">{body}</p>
    </div>
  );
}
