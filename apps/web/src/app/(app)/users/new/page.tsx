'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ROLES, type CreateUserResponse, type Role } from '@dv-wms/types';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { useCreateUser } from '@/lib/api/users';
import { useListTeams } from '@/lib/api/teams';
import { useAuthStore } from '@/lib/auth-store';

export default function NewUserPage() {
  const router = useRouter();
  const me = useAuthStore((s) => s.user);
  const teamsQuery = useListTeams();
  const create = useCreateUser();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<Role>('intern');
  const [internshipRole, setInternshipRole] = useState('');
  const [college, setCollege] = useState('');
  const [degree, setDegree] = useState('');
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const [created, setCreated] = useState<CreateUserResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (me?.role !== 'super_admin') {
    return (
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Not allowed</CardTitle>
          <CardDescription>Only the Super Admin can create users.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await create.mutateAsync({
        full_name: fullName.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim() || undefined,
        role,
        internship_role: internshipRole.trim() || undefined,
        college: college.trim() || undefined,
        degree: degree.trim() || undefined,
        team_ids: teamIds.length ? teamIds : undefined,
      });
      setCreated(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    }
  }

  if (created) {
    return (
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>User created</CardTitle>
          <CardDescription>
            An invite email was sent (or logged, if SMTP isn&apos;t configured). Share either the
            invite link or the temporary password.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-1.5">
            <Label>Invite link</Label>
            <div className="break-all rounded-md border bg-muted p-3 font-mono text-xs">
              {created.invite_url}
            </div>
            <p className="text-xs text-muted-foreground">
              Expires {new Date(created.invite_expires_at).toLocaleString()}. The user clicks this,
              chooses a password, and lands in the app.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void navigator.clipboard.writeText(created.invite_url)}
            >
              Copy link
            </Button>
          </div>
          <div className="space-y-1.5">
            <Label>Fallback temporary password</Label>
            <div className="rounded-md border bg-muted p-3 font-mono text-sm">
              {created.temp_password}
            </div>
            <p className="text-xs text-muted-foreground">
              If the invite email doesn&apos;t land, share this password instead. The user can sign
              in directly with their email and this password.
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => router.push('/users')}>Back to users</Button>
            <Button
              variant="outline"
              onClick={() => {
                setCreated(null);
                setFullName('');
                setEmail('');
                setPhone('');
                setInternshipRole('');
                setCollege('');
                setDegree('');
                setTeamIds([]);
              }}
            >
              Add another
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Add user" description="Create a new intern, leader, or admin account." />
      <Card className="max-w-2xl">
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-5 pt-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name" required>
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
              </Field>
              <Field label="Email" required>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </Field>
              <Field label="Phone">
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
              </Field>
              <Field label="Role" required>
                <Select value={role} onChange={(e) => setRole(e.target.value as Role)} required>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r.replace('_', ' ')}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Internship role / title">
                <Input
                  value={internshipRole}
                  onChange={(e) => setInternshipRole(e.target.value)}
                  placeholder="e.g. Lead Gen Intern"
                />
              </Field>
              <Field label="College">
                <Input value={college} onChange={(e) => setCollege(e.target.value)} />
              </Field>
              <Field label="Degree">
                <Input value={degree} onChange={(e) => setDegree(e.target.value)} />
              </Field>
              <Field label="Teams">
                <select
                  multiple
                  value={teamIds}
                  onChange={(e) =>
                    setTeamIds(Array.from(e.target.selectedOptions, (opt) => opt.value))
                  }
                  className="min-h-[10rem] w-full rounded-md border border-input bg-background p-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {teamsQuery.data?.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Hold ⌘/Ctrl to select multiple. The first is treated as the primary team.
                </p>
              </Field>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex gap-2">
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? 'Creating…' : 'Create user'}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.back()}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </form>
      </Card>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
    </div>
  );
}
