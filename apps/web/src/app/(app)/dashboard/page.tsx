'use client';

import Link from 'next/link';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type {
  DashboardResponse,
  DigestRange,
  DigestResponse,
  InternDashboard,
  LeadFunnel,
  StaffDashboard,
  TeamInsightsResponse,
  TeamInsightsWindow,
} from '@dv-wms/types';
import { dashboardIsStaff } from '@dv-wms/types';
import { AttendanceBadge } from '@/components/attendance-badge';
import { LeadStatusBadge } from '@/components/lead-status-badge';
import { BandBadge } from '@/components/performance-badges';
import { TaskPriorityBadge, TaskStatusBadge } from '@/components/task-badges';
import { TicketPriorityBadge, TicketStatusBadge } from '@/components/ticket-badges';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useDashboard, useGenerateTeamInsights } from '@/lib/api/dashboard';
import { useGenerateDailyReportDigest } from '@/lib/api/daily-reports';
import { useAuthStore } from '@/lib/auth-store';
import { cn } from '@/lib/utils';

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const dash = useDashboard();

  if (!user) return null;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">Welcome back, {user.full_name.split(' ')[0]}.</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {user.role === 'super_admin'
            ? 'Owner dashboard'
            : user.role === 'team_leader'
              ? 'Team leader dashboard'
              : 'Your day'}
        </h1>
      </div>

      {dash.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {dash.isError && (
        <p className="text-sm text-destructive">{(dash.error as Error).message}</p>
      )}

      {dash.data && (dashboardIsStaff(dash.data) ? (
        <StaffView data={dash.data.staff} role={dash.data.role} />
      ) : (
        <InternView data={(dash.data as Extract<DashboardResponse, { role: 'intern' }>).intern} />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Staff view (owner + leader)
// ─────────────────────────────────────────────────────────────────────────────

function StaffView({ data, role }: { data: StaffDashboard; role: 'super_admin' | 'team_leader' }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Interns" value={data.kpis.total_interns} href="/users?role=intern" />
        <KpiCard label="Active teams" value={data.kpis.active_teams} href="/teams" />
        <KpiCard label="Active projects" value={data.kpis.active_projects} href="/projects" />
        <KpiCard label="Leads" value={data.kpis.leads_generated} href="/leads" />
        <KpiCard label="Converted" value={data.kpis.leads_converted} href="/leads?status=converted" />
        <KpiCard label="Open tickets" value={data.kpis.open_tickets} href="/tickets?status=open" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Conversion funnel</CardTitle>
            <CardDescription>Lead pipeline across all statuses.</CardDescription>
          </CardHeader>
          <CardContent>
            <Funnel data={data.funnel} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Attendance today</CardTitle>
            <CardDescription>{data.attendance_today.total} people in scope.</CardDescription>
          </CardHeader>
          <CardContent>
            <AttendanceDonut data={data.attendance_today} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top performers</CardTitle>
            <CardDescription>Current rolling period.</CardDescription>
          </CardHeader>
          <CardContent>
            {data.top_performers.length === 0 && (
              <p className="text-sm text-muted-foreground">No scores yet.</p>
            )}
            <ol className="space-y-2">
              {data.top_performers.map((row) => (
                <li
                  key={row.user_id}
                  className="flex items-center justify-between gap-3 rounded-md border bg-card px-3 py-2 text-sm"
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

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Team performance</CardTitle>
            <CardDescription>Average score per active team.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.team_performance.length === 0 && (
              <p className="text-sm text-muted-foreground">No teams in scope.</p>
            )}
            {data.team_performance.map((t) => (
              <Link
                key={t.team_id}
                href={`/teams/${t.team_id}`}
                className="block rounded-md border bg-card p-3 text-sm hover:border-foreground/30"
              >
                <div className="flex items-baseline justify-between">
                  <span className="font-medium">{t.team_name}</span>
                  <span className="text-muted-foreground">
                    {t.avg_score} · {t.member_count} member{t.member_count === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-muted">
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${Math.min(100, Math.max(0, t.avg_score))}%` }}
                  />
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      {role === 'team_leader' && data.pending_review && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pending review</CardTitle>
            <CardDescription>Items from your team waiting on you.</CardDescription>
          </CardHeader>
          <CardContent className="flex gap-3">
            <Link href="/daily-reports" className="flex-1">
              <Card className="hover:border-foreground/30">
                <CardHeader className="pb-2">
                  <CardDescription>Daily reports</CardDescription>
                  <CardTitle className="text-3xl">{data.pending_review.daily_reports}</CardTitle>
                </CardHeader>
              </Card>
            </Link>
            <Link href="/tasks?status=in_review" className="flex-1">
              <Card className="hover:border-foreground/30">
                <CardHeader className="pb-2">
                  <CardDescription>Tasks in review</CardDescription>
                  <CardTitle className="text-3xl">{data.pending_review.tasks}</CardTitle>
                </CardHeader>
              </Card>
            </Link>
          </CardContent>
        </Card>
      )}

      <TeamInsightsCard />
      <DigestCard />
      <ExceptionsPanel data={data} />
    </div>
  );
}

function KpiCard({
  label,
  value,
  href,
}: {
  label: string;
  value: number | string;
  href: string;
}) {
  return (
    <Link href={href} className="block">
      <Card className="h-full transition-colors hover:border-foreground/30">
        <CardHeader className="pb-2">
          <CardDescription>{label}</CardDescription>
          <CardTitle className="text-3xl">{value}</CardTitle>
        </CardHeader>
      </Card>
    </Link>
  );
}

function Funnel({ data }: { data: LeadFunnel }) {
  const stages: { key: keyof LeadFunnel; label: string }[] = [
    { key: 'new', label: 'New' },
    { key: 'contacted', label: 'Contacted' },
    { key: 'interested', label: 'Interested' },
    { key: 'follow_up', label: 'Follow up' },
    { key: 'converted', label: 'Converted' },
  ];
  const max = Math.max(...stages.map((s) => data[s.key]), 1);
  return (
    <div className="space-y-2">
      {stages.map((s) => {
        const v = data[s.key];
        return (
          <div key={s.key}>
            <div className="flex items-baseline justify-between text-xs">
              <span className="font-medium">{s.label}</span>
              <span className="text-muted-foreground tabular-nums">{v}</span>
            </div>
            <div className="mt-1 h-2 w-full overflow-hidden rounded bg-muted">
              <div
                className={cn(
                  'h-full',
                  s.key === 'converted' ? 'bg-emerald-500' : 'bg-primary',
                )}
                style={{ width: `${(v / max) * 100}%` }}
              />
            </div>
          </div>
        );
      })}
      <p className="pt-2 text-xs text-muted-foreground">
        Lost {data.lost} · Invalid {data.invalid}
      </p>
    </div>
  );
}

function AttendanceDonut({
  data,
}: {
  data: {
    present: number;
    late: number;
    half_day: number;
    leave: number;
    absent: number;
    no_mark: number;
    total: number;
  };
}) {
  const rows: { key: keyof typeof data; label: string; cls: string }[] = [
    { key: 'present', label: 'Present', cls: 'bg-emerald-500' },
    { key: 'late', label: 'Late', cls: 'bg-amber-500' },
    { key: 'half_day', label: 'Half day', cls: 'bg-blue-500' },
    { key: 'leave', label: 'Leave', cls: 'bg-slate-500' },
    { key: 'absent', label: 'Absent', cls: 'bg-destructive' },
    { key: 'no_mark', label: 'No mark', cls: 'bg-muted-foreground/30' },
  ];
  const total = Math.max(1, data.total);
  return (
    <div className="space-y-2">
      <div className="flex h-3 w-full overflow-hidden rounded-full border">
        {rows.map((r) => {
          const v = data[r.key];
          if (!v) return null;
          return <div key={r.key} className={r.cls} style={{ width: `${(v / total) * 100}%` }} />;
        })}
      </div>
      <ul className="grid grid-cols-2 gap-y-1 text-xs">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center gap-2">
            <span className={cn('h-2 w-2 rounded-full', r.cls)} />
            <span className="text-muted-foreground">{r.label}</span>
            <span className="ml-auto tabular-nums">{data[r.key]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ExceptionsPanel({ data }: { data: StaffDashboard }) {
  const e = data.exceptions;
  const total = e.missing_reports_today + e.stale_leads + e.overdue_tasks + e.unattended_tickets;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Exceptions <span className="text-muted-foreground">({total})</span>
        </CardTitle>
        <CardDescription>Things that need attention right now.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ExceptionRow
          label="Missing reports today"
          count={e.missing_reports_today}
          href="/daily-reports/missing"
          previews={e.preview.missing_reports_users.map((u) => ({
            id: u.user_id,
            primary: u.full_name,
            href: `/users/${u.user_id}`,
          }))}
        />
        <ExceptionRow
          label="Stale leads"
          count={e.stale_leads}
          href="/leads"
          previews={e.preview.stale_lead_titles.map((l) => ({
            id: l.id,
            primary: l.name,
            href: `/leads/${l.id}`,
          }))}
        />
        <ExceptionRow
          label="Overdue tasks"
          count={e.overdue_tasks}
          href="/tasks?overdue=true"
          previews={e.preview.overdue_task_titles.map((t) => ({
            id: t.id,
            primary: t.title,
            secondary: t.assignee ?? 'Unassigned',
            href: `/tasks/${t.id}`,
          }))}
        />
        <ExceptionRow
          label="Unattended tickets"
          count={e.unattended_tickets}
          href="/tickets?unattended=true"
          previews={e.preview.unattended_ticket_titles.map((t) => ({
            id: t.id,
            primary: t.title,
            secondary: t.priority,
            href: `/tickets/${t.id}`,
          }))}
        />
      </CardContent>
    </Card>
  );
}

function ExceptionRow({
  label,
  count,
  href,
  previews,
}: {
  label: string;
  count: number;
  href: string;
  previews: { id: string; primary: string; secondary?: string; href: string }[];
}) {
  const variant = count > 0 ? 'destructive' : 'success';
  return (
    <div className="flex flex-col gap-2 rounded-md border bg-card p-3 sm:flex-row sm:items-start">
      <div className="flex w-full items-center justify-between sm:w-48">
        <span className="text-sm font-medium">{label}</span>
        <Badge variant={variant}>{count}</Badge>
      </div>
      <div className="flex-1 space-y-1 text-xs">
        {previews.length === 0 ? (
          <p className="text-muted-foreground">{count === 0 ? 'All clear.' : 'No preview rows.'}</p>
        ) : (
          previews.map((p) => (
            <Link
              key={p.id}
              href={p.href}
              className="flex items-center gap-2 hover:underline"
            >
              <span className="truncate">{p.primary}</span>
              {p.secondary && (
                <span className="text-muted-foreground">· {p.secondary}</span>
              )}
            </Link>
          ))
        )}
        {count > 0 && (
          <Link href={href} className="text-primary hover:underline">
            View all →
          </Link>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Intern view
// ─────────────────────────────────────────────────────────────────────────────

function InternView({ data }: { data: InternDashboard }) {
  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6">
          <div>
            <p className="text-sm text-muted-foreground">My score</p>
            <div className="flex items-baseline gap-3">
              <p className="text-4xl font-semibold leading-none">
                {data.my_score?.total_score ?? '—'}
              </p>
              {data.my_band && <BandBadge band={data.my_band} />}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <AttendanceBadge status={data.my_attendance_today.status} />
            {data.my_attendance_today.check_in && (
              <span className="text-xs text-muted-foreground">
                In{' '}
                {new Date(data.my_attendance_today.check_in).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            )}
            <Button variant="outline" asChild>
              <Link href="/attendance">Attendance</Link>
            </Button>
            <Button asChild>
              <Link href="/performance">View score</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Today's tasks <span className="text-muted-foreground">({data.today_tasks.length})</span>
            </CardTitle>
            <CardDescription>Highest priority and anything due today.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.today_tasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing on your plate.</p>
            ) : (
              data.today_tasks.map((t) => (
                <Link
                  key={t.id}
                  href={`/tasks/${t.id}`}
                  className="block rounded-md border bg-card p-3 text-sm hover:border-foreground/30"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium">{t.title}</p>
                    <div className="flex items-center gap-1">
                      <TaskPriorityBadge priority={t.priority} />
                      <TaskStatusBadge status={t.status} />
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t.due_date
                      ? `Due ${new Date(t.due_date).toLocaleDateString()}`
                      : 'No due date'}
                    {t.is_overdue && ' · overdue'}
                  </p>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Follow-ups due <span className="text-muted-foreground">({data.upcoming_followups.length})</span>
            </CardTitle>
            <CardDescription>Leads waiting on a check-in.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.upcoming_followups.length === 0 ? (
              <p className="text-sm text-muted-foreground">Pipeline is clean.</p>
            ) : (
              data.upcoming_followups.map((l) => (
                <Link
                  key={l.id}
                  href={`/leads/${l.id}`}
                  className="block rounded-md border bg-card p-3 text-sm hover:border-foreground/30"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{l.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {l.next_follow_up
                          ? `Follow-up ${new Date(l.next_follow_up).toLocaleDateString()}`
                          : 'No follow-up date'}
                      </p>
                    </div>
                    <LeadStatusBadge status={l.status} />
                  </div>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">Daily report</CardTitle>
                <CardDescription>
                  {new Date().toLocaleDateString(undefined, {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                  })}
                </CardDescription>
              </div>
              {data.today_report ? (
                data.today_report.reviewed_at ? (
                  <Badge variant="success">Reviewed</Badge>
                ) : (
                  <Badge variant="muted">Submitted</Badge>
                )
              ) : (
                <Badge variant="warning">Not submitted</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {data.today_report ? (
              <p className="line-clamp-3 text-sm text-muted-foreground">
                {data.today_report.todays_work}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                A short reflection takes 2 minutes and feeds your discipline score.
              </p>
            )}
            <Button asChild className="mt-3" variant={data.today_report ? 'outline' : 'default'}>
              <Link href="/daily-reports">
                {data.today_report ? 'View / edit' : 'Submit report'}
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              My open tickets{' '}
              <span className="text-muted-foreground">({data.my_open_tickets.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.my_open_tickets.length === 0 ? (
              <p className="text-sm text-muted-foreground">No tickets open.</p>
            ) : (
              data.my_open_tickets.map((t) => (
                <Link
                  key={t.id}
                  href={`/tickets/${t.id}`}
                  className="block rounded-md border bg-card p-3 text-sm hover:border-foreground/30"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium">{t.title}</p>
                    <div className="flex items-center gap-1">
                      <TicketPriorityBadge priority={t.priority} />
                      <TicketStatusBadge status={t.status} />
                    </div>
                  </div>
                  {t.is_unattended && (
                    <p className="mt-1 text-xs text-destructive">Unattended</p>
                  )}
                </Link>
              ))
            )}
            <Button variant="outline" className="mt-2" asChild>
              <Link href="/tickets/new">Raise a new ticket</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Daily report digest (AI). Surfaces above the exceptions panel; staff-only.
// ─────────────────────────────────────────────────────────────────────────────

const DIGEST_RANGES: { value: DigestRange; label: string }[] = [
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'this_week', label: 'This week' },
  { value: 'last_7_days', label: 'Last 7 days' },
];

function DigestCard() {
  const generate = useGenerateDailyReportDigest();
  const [range, setRange] = useState<DigestRange>('yesterday');
  const [result, setResult] = useState<DigestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setError(null);
    try {
      const r = await generate.mutateAsync({ range });
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Digest failed');
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-base">Daily report digest</CardTitle>
            <CardDescription>
              An AI-written synthesis of what your visible cohort reported in
              the selected window. Themes, wins, blockers, missing reports, and
              what to watch tomorrow.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-md border bg-card p-1">
              {DIGEST_RANGES.map((r) => (
                <Button
                  key={r.value}
                  variant={range === r.value ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setRange(r.value)}
                  disabled={generate.isPending}
                >
                  {r.label}
                </Button>
              ))}
            </div>
            <Button onClick={handleGenerate} disabled={generate.isPending}>
              {generate.isPending ? 'Generating…' : result ? 'Regenerate' : 'Generate'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!result && !error && (
          <p className="text-sm text-muted-foreground">
            Click Generate to produce a digest. The system prompt is cached, so
            re-runs within ~5 minutes pay roughly 10% the input cost.
          </p>
        )}
        {result && (
          <div className="space-y-4">
            <article className="prose prose-sm max-w-none dark:prose-invert prose-headings:mt-4 prose-headings:mb-2 prose-p:my-2 prose-ul:my-2 prose-li:my-0.5">
              <ReactMarkdown>{result.markdown}</ReactMarkdown>
            </article>
            <div className="flex flex-wrap gap-x-4 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
              <span>{result.period_label}</span>
              <span>
                {result.period_start.slice(0, 10)} → {result.period_end.slice(0, 10)}
              </span>
              <span>{result.reports_total} reports</span>
              {result.missing_total > 0 && <span>{result.missing_total} missing</span>}
              <span>Model: {result.model}</span>
              <span>Input: {result.usage.input_tokens}</span>
              <span>Output: {result.usage.output_tokens}</span>
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

// ─────────────────────────────────────────────────────────────────────────────
// AI cross-team productivity insights — appears at the top of the staff
// dashboard, above the digest card.
// ─────────────────────────────────────────────────────────────────────────────

const INSIGHT_WINDOWS: { value: TeamInsightsWindow; label: string }[] = [
  { value: 7, label: '7 days' },
  { value: 14, label: '14 days' },
  { value: 30, label: '30 days' },
];

function TeamInsightsCard() {
  const generate = useGenerateTeamInsights();
  const [days, setDays] = useState<TeamInsightsWindow>(7);
  const [result, setResult] = useState<TeamInsightsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setError(null);
    try {
      const r = await generate.mutateAsync({ days });
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Insights failed');
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-base">Team productivity insights</CardTitle>
            <CardDescription>
              An AI-written cross-team analysis: what's working, where the
              bottlenecks are, which teams are imbalanced, and what to do this
              week.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-md border bg-card p-1">
              {INSIGHT_WINDOWS.map((w) => (
                <Button
                  key={w.value}
                  variant={days === w.value ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setDays(w.value)}
                  disabled={generate.isPending}
                >
                  {w.label}
                </Button>
              ))}
            </div>
            <Button onClick={handleGenerate} disabled={generate.isPending}>
              {generate.isPending ? 'Analyzing…' : result ? 'Regenerate' : 'Generate'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!result && !error && (
          <p className="text-sm text-muted-foreground">
            Click Generate to produce a cross-team analysis. The system prompt
            is cached — re-runs within ~5 minutes are ~10% the input cost.
          </p>
        )}
        {result && (
          <div className="space-y-4">
            <article className="prose prose-sm max-w-none dark:prose-invert prose-headings:mt-4 prose-headings:mb-2 prose-p:my-2 prose-ol:my-2 prose-li:my-0.5">
              <ReactMarkdown>{result.markdown}</ReactMarkdown>
            </article>
            <div className="flex flex-wrap gap-x-4 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
              <span>
                {result.window_start.slice(0, 10)} → {result.window_end.slice(0, 10)} ({result.window_days}d)
              </span>
              <span>{result.teams_total} teams</span>
              <span>Model: {result.model}</span>
              <span>Input: {result.usage.input_tokens}</span>
              <span>Output: {result.usage.output_tokens}</span>
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
