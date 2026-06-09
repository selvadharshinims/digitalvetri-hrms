'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ROLES, USER_STATUSES, type Role, type UserStatus } from '@dv-wms/types';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { useListUsers } from '@/lib/api/users';
import { useAuthStore } from '@/lib/auth-store';

const PAGE_SIZE = 25;

export default function UsersPage() {
  const me = useAuthStore((s) => s.user);
  const canCreate = me?.role === 'super_admin';

  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [role, setRole] = useState<Role | ''>('');
  const [status, setStatus] = useState<UserStatus | ''>('');

  const query = useListUsers({
    page,
    limit: PAGE_SIZE,
    q: q || undefined,
    role: role || undefined,
    status: status || undefined,
  });

  const totalPages = query.data ? Math.max(1, Math.ceil(query.data.meta.total / PAGE_SIZE)) : 1;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description="People in the DigitalVetri workforce."
        actions={
          canCreate && (
            <Button asChild>
              <Link href="/users/new">Add user</Link>
            </Button>
          )
        }
      />

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="grid gap-3 sm:grid-cols-[1fr,180px,180px]">
            <Input
              placeholder="Search by name or email…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
            <Select
              value={role}
              onChange={(e) => {
                setRole(e.target.value as Role | '');
                setPage(1);
              }}
            >
              <option value="">All roles</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r.replace('_', ' ')}
                </option>
              ))}
            </Select>
            <Select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as UserStatus | '');
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              {USER_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Teams</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.isLoading && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              )}
              {query.isError && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-destructive">
                    {(query.error as Error).message}
                  </TableCell>
                </TableRow>
              )}
              {query.data?.data.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No users match these filters.
                  </TableCell>
                </TableRow>
              )}
              {query.data?.data.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">
                    <Link href={`/users/${u.id}`} className="hover:underline">
                      {u.full_name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{u.email}</TableCell>
                  <TableCell>
                    <Badge variant="muted">{u.role.replace('_', ' ')}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(u.status)}>{u.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {u.memberships.length}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <p>
              Page {page} of {totalPages} · {query.data?.meta.total ?? 0} total
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
        </CardContent>
      </Card>
    </div>
  );
}

function statusVariant(s: UserStatus): 'success' | 'muted' | 'warning' {
  if (s === 'active') return 'success';
  if (s === 'completed') return 'muted';
  return 'warning';
}
