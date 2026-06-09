'use client';

import { useState } from 'react';
import { ATTENDANCE_STATUSES, type AttendanceStatus } from '@dv-wms/types';
import { AttendanceBadge, ATTENDANCE_LABELS } from '@/components/attendance-badge';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  useAttendanceReport,
  useAttendanceToday,
  useCheckIn,
  useCheckOut,
  useListAttendance,
  useMarkAttendance,
} from '@/lib/api/attendance';
import { useAuthStore } from '@/lib/auth-store';
import { cn } from '@/lib/utils';

export default function AttendancePage() {
  const me = useAuthStore((s) => s.user);
  if (!me) return null;
  const isLeader = me.role !== 'intern';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance"
        description="Daily presence and monthly summaries."
      />

      <SelfWidget />
      <SelfHistory />

      {isLeader && (
        <>
          <TeamToday />
          <MonthlyReport />
        </>
      )}
    </div>
  );
}

function SelfWidget() {
  const me = useAuthStore((s) => s.user);
  const today = useAttendanceToday();
  const checkIn = useCheckIn();
  const checkOut = useCheckOut();
  const [error, setError] = useState<string | null>(null);

  // Pull the caller's row from "today" snapshot (admins/leaders); otherwise hit /attendance for self.
  const selfList = useListAttendance({
    user_id: me?.id,
    from: new Date().toISOString().slice(0, 10),
    to: new Date().toISOString().slice(0, 10),
    limit: 1,
  });
  const selfRow = selfList.data?.data[0];
  const teamRow = today.data?.find((r) => r.user_id === me?.id);

  const checkInTime = selfRow?.check_in ?? teamRow?.check_in ?? null;
  const checkOutTime = selfRow?.check_out ?? teamRow?.check_out ?? null;
  const status = selfRow?.status ?? teamRow?.status ?? null;

  async function handleIn() {
    setError(null);
    try {
      await checkIn.mutateAsync();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Check-in failed');
    }
  }

  async function handleOut() {
    setError(null);
    try {
      await checkOut.mutateAsync();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Check-out failed');
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Today</CardTitle>
        <CardDescription>{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <AttendanceBadge status={status as AttendanceStatus | null} />
          {checkInTime && (
            <span className="text-sm text-muted-foreground">
              Checked in {new Date(checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          {checkOutTime && (
            <span className="text-sm text-muted-foreground">
              · Checked out {new Date(checkOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
          <Button
            size="lg"
            className="h-12 text-base"
            onClick={handleIn}
            disabled={checkIn.isPending || !!checkInTime}
          >
            {checkInTime ? 'Already checked in' : checkIn.isPending ? 'Checking in…' : 'Check in'}
          </Button>
          <Button
            size="lg"
            className="h-12 text-base"
            onClick={handleOut}
            variant="outline"
            disabled={checkOut.isPending || !checkInTime || !!checkOutTime}
          >
            {checkOutTime ? 'Checked out' : checkOut.isPending ? 'Checking out…' : 'Check out'}
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}

function SelfHistory() {
  const me = useAuthStore((s) => s.user);
  const [from, setFrom] = useState(() => firstOfMonth());
  const [to, setTo] = useState(() => todayIso());

  const list = useListAttendance({
    user_id: me?.id,
    from,
    to,
    limit: 100,
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base">My history</CardTitle>
            <CardDescription>Day-by-day attendance.</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <span className="text-xs text-muted-foreground">→</span>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>In</TableHead>
              <TableHead>Out</TableHead>
              <TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.isLoading && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {list.data?.data.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  No attendance in this range.
                </TableCell>
              </TableRow>
            )}
            {list.data?.data.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{new Date(row.date).toLocaleDateString()}</TableCell>
                <TableCell>
                  <AttendanceBadge status={row.status} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {row.check_in ? new Date(row.check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {row.check_out ? new Date(row.check_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                </TableCell>
                <TableCell className="text-muted-foreground">{row.notes ?? '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function TeamToday() {
  const today = useAttendanceToday();
  const mark = useMarkAttendance();
  const todayIsoStr = todayIso();
  const [error, setError] = useState<string | null>(null);

  async function handleMark(userId: string, status: AttendanceStatus) {
    setError(null);
    try {
      await mark.mutateAsync({ user_id: userId, date: todayIsoStr, status });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Mark failed');
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Team — today</CardTitle>
        <CardDescription>Mark members directly, or let them self check-in.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Person</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Check-in</TableHead>
              <TableHead className="text-right">Mark</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {today.isLoading && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {today.data?.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  No visible team members.
                </TableCell>
              </TableRow>
            )}
            {today.data?.map((row) => (
              <TableRow key={row.user_id}>
                <TableCell className="font-medium">
                  {row.full_name}
                  <p className="text-xs text-muted-foreground">{row.email}</p>
                </TableCell>
                <TableCell>
                  <AttendanceBadge status={row.status} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {row.check_in ? new Date(row.check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                </TableCell>
                <TableCell className="text-right">
                  <Select
                    defaultValue=""
                    onChange={(e) => {
                      const v = e.target.value as AttendanceStatus | '';
                      if (v) handleMark(row.user_id, v);
                      e.target.value = '';
                    }}
                    className={cn('inline-flex h-8 w-auto', 'text-xs')}
                  >
                    <option value="">Mark…</option>
                    {ATTENDANCE_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {ATTENDANCE_LABELS[s]}
                      </option>
                    ))}
                  </Select>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function MonthlyReport() {
  const [month, setMonth] = useState(() => currentYyyymm());
  const report = useAttendanceReport({ month });

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base">Monthly report</CardTitle>
            <CardDescription>Per-person counts and attendance %.</CardDescription>
          </div>
          <Input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="sm:max-w-[180px]"
          />
        </div>
      </CardHeader>
      <CardContent>
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
            {report.isLoading && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {report.data?.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  No people in scope.
                </TableCell>
              </TableRow>
            )}
            {report.data?.map((row) => (
              <TableRow key={row.user_id}>
                <TableCell className="font-medium">{row.full_name}</TableCell>
                <TableCell className="text-muted-foreground">{row.working_days}</TableCell>
                <TableCell>{row.present}</TableCell>
                <TableCell>{row.late}</TableCell>
                <TableCell>{row.half_day}</TableCell>
                <TableCell>{row.leave}</TableCell>
                <TableCell>{row.absent}</TableCell>
                <TableCell className="text-right font-medium">{row.attendance_pct}%</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function firstOfMonth() {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

function currentYyyymm() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
