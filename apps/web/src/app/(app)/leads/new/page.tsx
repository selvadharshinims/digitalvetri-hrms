'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useCreateLead } from '@/lib/api/leads';
import { useListTeams } from '@/lib/api/teams';
import { useListUsers } from '@/lib/api/users';
import { useAuthStore } from '@/lib/auth-store';

export default function NewLeadPage() {
  const router = useRouter();
  const me = useAuthStore((s) => s.user);
  const create = useCreateLead();
  const teams = useListTeams();
  const users = useListUsers({ status: 'active', limit: 100 });

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [source, setSource] = useState('');
  const [interest, setInterest] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [value, setValue] = useState('');
  const [teamId, setTeamId] = useState('');
  const [assignee, setAssignee] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (me?.role === 'intern') {
    return <p className="text-sm text-muted-foreground">Interns cannot create leads directly.</p>;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const lead = await create.mutateAsync({
        name: name.trim(),
        phone: phone.trim() || undefined,
        email: email.trim().toLowerCase() || undefined,
        source: source.trim() || undefined,
        service_interest: interest.trim() || undefined,
        location: location.trim() || undefined,
        notes: notes.trim() || undefined,
        estimated_value: value ? Number(value) : undefined,
        team_id: teamId || undefined,
        assigned_to: assignee || undefined,
      });
      router.push(`/leads/${lead.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="New lead" description="Manually capture a single lead." />
      <Card className="max-w-3xl">
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4 pt-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name" required>
                <Input value={name} onChange={(e) => setName(e.target.value)} required />
              </Field>
              <Field label="Phone">
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
              </Field>
              <Field label="Email">
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
              <Field label="Source">
                <Input
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  placeholder="e.g. LinkedIn, referral"
                />
              </Field>
              <Field label="Service interest">
                <Input value={interest} onChange={(e) => setInterest(e.target.value)} />
              </Field>
              <Field label="Location">
                <Input value={location} onChange={(e) => setLocation(e.target.value)} />
              </Field>
              <Field label="Estimated value (₹)">
                <Input
                  type="number"
                  min="0"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                />
              </Field>
              <Field label="Team">
                <Select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
                  <option value="">— None —</option>
                  {teams.data?.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Assignee">
                <Select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                  <option value="">Unassigned</option>
                  {users.data?.data.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Notes">
              <Textarea
                rows={4}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any context the intern should know before reaching out…"
              />
            </Field>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex gap-2">
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? 'Creating…' : 'Create lead'}
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
