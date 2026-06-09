'use client';

import Link from 'next/link';
import { useState } from 'react';
import { PROJECT_STATUSES, type ProjectStatus } from '@dv-wms/types';
import { PageHeader } from '@/components/page-header';
import { DeadlineBadge, ProjectStatusBadge, PROJECT_STATUS_LABELS } from '@/components/project-badges';
import { ProjectRiskBadge } from '@/components/project-risk-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useAssessProjectRisks, useListProjects } from '@/lib/api/projects';
import { useAuthStore } from '@/lib/auth-store';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 24;

export default function ProjectsPage() {
  const me = useAuthStore((s) => s.user);
  const canCreate = me?.role === 'super_admin';
  const canAssess = me?.role !== 'intern';

  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<ProjectStatus | ''>('');
  const [atRisk, setAtRisk] = useState(false);

  const list = useListProjects({
    page,
    limit: PAGE_SIZE,
    q: q || undefined,
    status: status || undefined,
    at_risk: atRisk || undefined,
  });
  const totalPages = list.data ? Math.max(1, Math.ceil(list.data.meta.total / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Projects"
        description="Client work and internal builds."
        actions={
          <>
            {canAssess && <AssessWithAiButton />}
            {canCreate && (
              <Button asChild>
                <Link href="/projects/new">New project</Link>
              </Button>
            )}
          </>
        }
      />

      <Card>
        <CardContent className="grid gap-3 pt-6 sm:grid-cols-[1fr,180px,auto]">
          <Input
            placeholder="Search by name, client, or category…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as ProjectStatus | '');
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            {PROJECT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {PROJECT_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
          <Button
            variant={atRisk ? 'default' : 'outline'}
            onClick={() => {
              setAtRisk((v) => !v);
              setPage(1);
            }}
          >
            At-risk only
          </Button>
        </CardContent>
      </Card>

      {list.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {list.isError && (
        <p className="text-sm text-destructive">{(list.error as Error).message}</p>
      )}

      {list.data && list.data.data.length === 0 && (
        <Card>
          <CardContent className="pt-6 text-center text-sm text-muted-foreground">
            No projects match these filters.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {list.data?.data.map((p) => {
          const progress = Math.min(100, Math.max(0, p.progress_pct));
          const derived = Math.min(100, Math.max(0, p.derived_progress_pct));
          const showDerivedHint = derived !== progress;
          return (
            <Link key={p.id} href={`/projects/${p.id}`} className="block group">
              <Card
                className={cn(
                  'h-full transition-colors group-hover:border-foreground/30',
                  p.deadline_risk === 'overdue' && 'border-destructive/40',
                  p.deadline_risk === 'approaching' && 'border-amber-500/40',
                  p.ai_risk_band === 'stalled' && 'border-destructive/60',
                  p.ai_risk_band === 'off_track' && 'border-destructive/50',
                )}
              >
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base leading-tight">{p.name}</CardTitle>
                    <div className="flex flex-col items-end gap-1">
                      <ProjectStatusBadge status={p.status} />
                      <ProjectRiskBadge
                        score={p.ai_risk_score}
                        band={p.ai_risk_band}
                        scoredAt={p.ai_risk_at}
                      />
                    </div>
                  </div>
                  <CardDescription className="space-x-1">
                    {p.client_name && <span>{p.client_name}</span>}
                    {p.category && p.client_name && <span>·</span>}
                    {p.category && <span>{p.category}</span>}
                  </CardDescription>
                  {p.ai_risk_concern && (
                    <p className="pt-1 text-xs text-muted-foreground line-clamp-2">
                      {p.ai_risk_concern}
                    </p>
                  )}
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Progress</span>
                      <span>{progress}%</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded bg-muted">
                      <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
                    </div>
                    {showDerivedHint && (
                      <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                        Derived from work: {derived}%
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {p.team && <span>{p.team.name}</span>}
                    <DeadlineBadge deadline={p.deadline} risk={p.deadline_risk} />
                  </div>
                  <div className="grid grid-cols-2 text-xs text-muted-foreground">
                    <span>
                      {p.deliverables_done}/{p.deliverables_total} deliverables
                    </span>
                    <span className="text-right">
                      {p.tasks_completed}/{p.tasks_total} tasks
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <p>
          Page {page} of {totalPages} · {list.data?.meta.total ?? 0} total
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

function AssessWithAiButton() {
  const assess = useAssessProjectRisks();
  const [error, setError] = useState<string | null>(null);
  const [lastCount, setLastCount] = useState<number | null>(null);

  async function handleClick() {
    setError(null);
    try {
      const r = await assess.mutateAsync({});
      setLastCount(r.assessed.length);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Assessment failed');
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        onClick={handleClick}
        disabled={assess.isPending}
        title="AI-assesses delivery risk on up to 20 in-scope active projects"
      >
        {assess.isPending ? 'Assessing…' : 'Assess with AI'}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
      {!error && lastCount !== null && (
        <span className="text-xs text-muted-foreground">Assessed {lastCount}</span>
      )}
    </div>
  );
}
