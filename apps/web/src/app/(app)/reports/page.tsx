'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { ReportType } from '@dv-wms/types';
import { PageHeader } from '@/components/page-header';
import { BandBadge } from '@/components/performance-badges';
import { DeadlineBadge, ProjectStatusBadge } from '@/components/project-badges';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useListTeams } from '@/lib/api/teams';
import {
  downloadReportCsv,
  useAttendanceReportFull,
  useConversionReport,
  useInternRankingsReport,
  useLeadPerformanceReport,
  useProjectProgressReport,
  useTeamPerformanceReport,
  type ReportParams,
} from '@/lib/api/reports';
import { useAuthStore } from '@/lib/auth-store';
import { cn } from '@/lib/utils';

const SECTIONS: { id: ReportType; label: string; description: string }[] = [
  { id: 'team-performance', label: 'Team performance', description: 'Score, leads, attendance per team.' },
  { id: 'lead-performance', label: 'Lead performance', description: 'Conversion + deal value per intern.' },
  { id: 'attendance', label: 'Attendance', description: 'Per-user counts and %.' },
  { id: 'project-progress', label: 'Project progress', description: 'Status, progress, deadlines.' },
  { id: 'intern-rankings', label: 'Intern rankings', description: 'Leaderboard with per-factor breakdown.' },
  { id: 'conversion', label: 'Conversion', description: 'Funnel and per-source deal value.' },
];

export default function ReportsPage() {
  const me = useAuthStore((s) => s.user);
  const [active, setActive] = useState<ReportType>('team-performance');
  const [from, setFrom] = useState(() => firstOfMonth());
  const [to, setTo] = useState(() => todayIso());
  const [teamId, setTeamId] = useState('');
  const teams = useListTeams();

  if (me?.role === 'intern') {
    return <p className="text-sm text-muted-foreground">Reports are available to leaders and admins.</p>;
  }

  const params: ReportParams = {
    from,
    to,
    team_id: teamId || undefined,
  };

  async function handleDownload() {
    try {
      await downloadReportCsv(active, params);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Download failed');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports & analytics"
        description="Filter, view, and export as CSV."
        actions={
          <Button onClick={handleDownload} variant="outline">
            Download CSV
          </Button>
        }
      />

      <Card>
        <CardContent className="grid gap-3 pt-6 sm:grid-cols-[1fr,1fr,1fr]">
          <div className="space-y-2">
            <Label>From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Team (optional)</Label>
            <Select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
              <option value="">All teams in scope</option>
              {teams.data?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        {SECTIONS.map((s) => (
          <Button
            key={s.id}
            variant={active === s.id ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActive(s.id)}
          >
            {s.label}
          </Button>
        ))}
      </div>

      {active === 'team-performance' && <TeamPerformanceSection params={params} />}
      {active === 'lead-performance' && <LeadPerformanceSection params={params} />}
      {active === 'attendance' && <AttendanceSection params={params} />}
      {active === 'project-progress' && <ProjectProgressSection params={params} />}
      {active === 'intern-rankings' && <InternRankingsSection params={params} />}
      {active === 'conversion' && <ConversionSection params={params} />}
    </div>
  );
}

function ReportShell({
  title,
  description,
  meta,
  children,
}: {
  title: string;
  description: string;
  meta?: { from: string; to: string; generated_at: string };
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>
          {description}
          {meta && (
            <>
              {' '}
              <span className="text-xs text-muted-foreground">
                · {meta.from} → {meta.to}
              </span>
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function TeamPerformanceSection({ params }: { params: ReportParams }) {
  const q = useTeamPerformanceReport(params);
  return (
    <ReportShell
      title="Team performance"
      description="Average score, leads generated, conversion, tasks completed, attendance."
      meta={q.data?.meta}
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Team</TableHead>
            <TableHead>Members</TableHead>
            <TableHead>Avg score</TableHead>
            <TableHead>Leads</TableHead>
            <TableHead>Converted</TableHead>
            <TableHead>Conversion %</TableHead>
            <TableHead>Tasks done</TableHead>
            <TableHead>Attendance %</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {q.isLoading && (
            <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>
          )}
          {q.data?.data.map((r) => (
            <TableRow key={r.team_id}>
              <TableCell className="font-medium">
                <Link href={`/teams/${r.team_id}`} className="hover:underline">{r.team_name}</Link>
              </TableCell>
              <TableCell>{r.member_count}</TableCell>
              <TableCell className="font-medium">{r.avg_score}</TableCell>
              <TableCell>{r.leads_generated}</TableCell>
              <TableCell>{r.leads_converted}</TableCell>
              <TableCell>{r.conversion_rate_pct}%</TableCell>
              <TableCell>{r.tasks_completed}</TableCell>
              <TableCell>{r.attendance_avg_pct}%</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ReportShell>
  );
}

function LeadPerformanceSection({ params }: { params: ReportParams }) {
  const q = useLeadPerformanceReport(params);
  return (
    <ReportShell
      title="Lead performance"
      description="Pipeline and conversion per person."
      meta={q.data?.meta}
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Person</TableHead>
            <TableHead>Teams</TableHead>
            <TableHead>Assigned</TableHead>
            <TableHead>Worked</TableHead>
            <TableHead>Converted</TableHead>
            <TableHead>Conversion %</TableHead>
            <TableHead className="text-right">Deal value</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {q.isLoading && (
            <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>
          )}
          {q.data?.data.map((r) => (
            <TableRow key={r.user_id}>
              <TableCell className="font-medium">
                <Link href={`/users/${r.user_id}`} className="hover:underline">{r.full_name}</Link>
              </TableCell>
              <TableCell className="text-muted-foreground text-xs">{r.team_names.join(', ')}</TableCell>
              <TableCell>{r.leads_assigned}</TableCell>
              <TableCell>{r.leads_worked}</TableCell>
              <TableCell>{r.leads_converted}</TableCell>
              <TableCell>{r.conversion_rate_pct}%</TableCell>
              <TableCell className="text-right tabular-nums">
                {r.total_deal_value > 0 ? `₹${r.total_deal_value.toLocaleString()}` : '—'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ReportShell>
  );
}

function AttendanceSection({ params }: { params: ReportParams }) {
  const q = useAttendanceReportFull(params);
  return (
    <ReportShell
      title="Attendance"
      description="Per-person counts and attendance %."
      meta={q.data?.meta}
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Person</TableHead>
            <TableHead>Working</TableHead>
            <TableHead>Present</TableHead>
            <TableHead>Late</TableHead>
            <TableHead>Half</TableHead>
            <TableHead>Leave</TableHead>
            <TableHead>Absent</TableHead>
            <TableHead className="text-right">%</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {q.isLoading && (
            <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>
          )}
          {q.data?.data.map((r) => (
            <TableRow key={r.user_id}>
              <TableCell className="font-medium">{r.full_name}</TableCell>
              <TableCell className="text-muted-foreground">{r.working_days}</TableCell>
              <TableCell>{r.present}</TableCell>
              <TableCell>{r.late}</TableCell>
              <TableCell>{r.half_day}</TableCell>
              <TableCell>{r.leave}</TableCell>
              <TableCell>{r.absent}</TableCell>
              <TableCell className="text-right font-medium">{r.attendance_pct}%</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ReportShell>
  );
}

function ProjectProgressSection({ params }: { params: ReportParams }) {
  const q = useProjectProgressReport(params);
  return (
    <ReportShell
      title="Project progress"
      description="Status, progress, and deadline risk."
      meta={q.data?.meta}
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Project</TableHead>
            <TableHead>Team</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Progress</TableHead>
            <TableHead>Deliverables</TableHead>
            <TableHead>Tasks</TableHead>
            <TableHead>Deadline</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {q.isLoading && (
            <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>
          )}
          {q.data?.data.map((r) => (
            <TableRow key={r.project_id}>
              <TableCell className="font-medium">
                <Link href={`/projects/${r.project_id}`} className="hover:underline">{r.project_name}</Link>
                {r.client_name && (
                  <p className="text-xs text-muted-foreground">{r.client_name}</p>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground">{r.team_name ?? '—'}</TableCell>
              <TableCell>
                <ProjectStatusBadge status={r.status as never} />
              </TableCell>
              <TableCell>
                <div className="text-xs text-muted-foreground">
                  {r.progress_pct}% · derived {r.derived_progress_pct}%
                </div>
                <div className="mt-1 h-1.5 w-32 overflow-hidden rounded bg-muted">
                  <div className="h-full bg-primary" style={{ width: `${r.progress_pct}%` }} />
                </div>
              </TableCell>
              <TableCell>{r.deliverables_done}/{r.deliverables_total}</TableCell>
              <TableCell>{r.tasks_completed}/{r.tasks_total}</TableCell>
              <TableCell>
                <DeadlineBadge deadline={r.deadline} risk={r.deadline_risk} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ReportShell>
  );
}

function InternRankingsSection({ params }: { params: ReportParams }) {
  const q = useInternRankingsReport(params);
  return (
    <ReportShell
      title="Intern rankings"
      description="Composite score with per-factor breakdown."
      meta={q.data?.meta}
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">#</TableHead>
            <TableHead>Person</TableHead>
            <TableHead>Total</TableHead>
            <TableHead>Att</TableHead>
            <TableHead>Tasks</TableHead>
            <TableHead>Leads</TableHead>
            <TableHead>Project</TableHead>
            <TableHead>Feedback</TableHead>
            <TableHead>Discipline</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {q.isLoading && (
            <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>
          )}
          {q.data?.data.map((r) => (
            <TableRow key={r.user_id}>
              <TableCell className="text-muted-foreground">{r.rank}</TableCell>
              <TableCell className="font-medium">
                <Link href={`/performance/${r.user_id}`} className="hover:underline">{r.full_name}</Link>
                <p className="text-xs text-muted-foreground">{r.team_names.join(', ')}</p>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <span className="text-base font-semibold tabular-nums">{r.total_score}</span>
                  <BandBadge band={r.band} />
                </div>
              </TableCell>
              <TableCell className="tabular-nums">{Math.round(r.attendance_score)}</TableCell>
              <TableCell className="tabular-nums">{Math.round(r.task_score)}</TableCell>
              <TableCell className="tabular-nums">{Math.round(r.lead_score)}</TableCell>
              <TableCell className="tabular-nums">{Math.round(r.project_score)}</TableCell>
              <TableCell className="tabular-nums">{Math.round(r.feedback_score)}</TableCell>
              <TableCell className="tabular-nums">{Math.round(r.discipline_score)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ReportShell>
  );
}

function ConversionSection({ params }: { params: ReportParams }) {
  const q = useConversionReport(params);
  const report = q.data?.data[0];

  return (
    <div className="space-y-4">
      <ReportShell
        title="Conversion overview"
        description="Pipeline counts and deal value."
        meta={q.data?.meta}
      >
        {q.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {report && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat label="Converted" value={report.funnel.converted} />
              <Stat label="Total deal value" value={`₹${report.total_deal_value.toLocaleString()}`} />
              <Stat label="Avg deal value" value={`₹${report.avg_deal_value.toLocaleString()}`} />
            </div>
            <div className="flex flex-wrap gap-2">
              {(['new', 'contacted', 'interested', 'follow_up', 'converted', 'lost', 'invalid'] as const).map((k) => (
                <Badge key={k} variant="muted" className={cn(k === 'converted' && 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300')}>
                  {k.replace('_', ' ')}: {report.funnel[k]}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </ReportShell>

      <ReportShell title="By source" description="Lead conversion broken out by source.">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Source</TableHead>
              <TableHead>Worked</TableHead>
              <TableHead>Converted</TableHead>
              <TableHead>Conversion %</TableHead>
              <TableHead className="text-right">Total value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report?.by_source.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No source activity in this range.</TableCell></TableRow>
            )}
            {report?.by_source.map((r) => (
              <TableRow key={r.source}>
                <TableCell className="font-medium">{r.source}</TableCell>
                <TableCell>{r.worked}</TableCell>
                <TableCell>{r.converted}</TableCell>
                <TableCell>{r.conversion_rate_pct}%</TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.total_value > 0 ? `₹${r.total_value.toLocaleString()}` : '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ReportShell>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md border bg-card p-3">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function firstOfMonth(): string {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
