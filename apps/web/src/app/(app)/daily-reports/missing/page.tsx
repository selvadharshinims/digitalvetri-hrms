'use client';

import Link from 'next/link';
import { useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { useMissingReports } from '@/lib/api/daily-reports';
import { useAuthStore } from '@/lib/auth-store';

export default function MissingReportsPage() {
  const me = useAuthStore((s) => s.user);
  const [days, setDays] = useState(7);
  const missing = useMissingReports({ days });

  if (me?.role === 'intern') {
    return <p className="text-sm text-muted-foreground">Only leaders and admins can view this page.</p>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Missing reports"
        description="People who haven't submitted on working days in the scan window."
        actions={
          <Button variant="outline" asChild>
            <Link href="/daily-reports">Back</Link>
          </Button>
        }
      />

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 pt-6 text-sm">
          <span className="text-muted-foreground">Scan window:</span>
          <Select
            value={String(days)}
            onChange={(e) => setDays(Number(e.target.value))}
            className="h-9 w-auto"
          >
            {[3, 5, 7, 14, 21, 30].map((d) => (
              <option key={d} value={d}>
                Past {d} days
              </option>
            ))}
          </Select>
          {missing.data && (
            <span className="text-muted-foreground">
              {missing.data.window_days.length} working day{missing.data.window_days.length === 1 ? '' : 's'} ·{' '}
              {missing.data.users.length} people with gaps
            </span>
          )}
        </CardContent>
      </Card>

      {missing.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {missing.data?.users.length === 0 && (
        <Card>
          <CardContent className="pt-6 text-center text-sm text-muted-foreground">
            Nobody missing in this window. Great discipline.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3">
        {missing.data?.users.map((u) => (
          <Card key={u.user_id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                <Link href={`/users/${u.user_id}`} className="hover:underline">
                  {u.full_name}
                </Link>
              </CardTitle>
              <CardDescription>
                {u.missing_dates.length} missing day{u.missing_dates.length === 1 ? '' : 's'}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2 pt-2">
              {u.missing_dates.map((d) => (
                <Badge key={d} variant="warning">
                  {new Date(d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
                </Badge>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
