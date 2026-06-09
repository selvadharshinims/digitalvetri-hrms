'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import {
  TICKET_PRIORITIES,
  TICKET_TYPES,
  type TicketPriority,
  type TicketType,
} from '@dv-wms/types';
import { PageHeader } from '@/components/page-header';
import { TICKET_TYPE_LABELS } from '@/components/ticket-badges';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useCreateTicket } from '@/lib/api/tickets';
import { useListTeams } from '@/lib/api/teams';

const TEAM_RELEVANT_TYPES = new Set<TicketType>(['technical', 'project_support']);

export default function NewTicketPage() {
  const router = useRouter();
  const create = useCreateTicket();
  const teams = useListTeams();

  const [type, setType] = useState<TicketType>('technical');
  const [priority, setPriority] = useState<TicketPriority>('medium');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [teamId, setTeamId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const showTeam = useMemo(() => TEAM_RELEVANT_TYPES.has(type), [type]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const ticket = await create.mutateAsync({
        type,
        priority,
        title: title.trim(),
        description: description.trim(),
        team_id: showTeam && teamId ? teamId : undefined,
      });
      router.push(`/tickets/${ticket.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="New ticket"
        description="Technical issues, leave requests, access asks, and general help."
      />
      <Card className="max-w-2xl">
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4 pt-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Type *</Label>
                <Select value={type} onChange={(e) => setType(e.target.value as TicketType)}>
                  {TICKET_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {TICKET_TYPE_LABELS[t]}
                    </option>
                  ))}
                </Select>
                {showTeam ? (
                  <CardDescription className="text-xs">
                    Routes to the team's leader.
                  </CardDescription>
                ) : (
                  <CardDescription className="text-xs">Routes to the admin queue.</CardDescription>
                )}
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as TicketPriority)}
                >
                  {TICKET_PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </Select>
              </div>
              {showTeam && (
                <div className="space-y-2 sm:col-span-2">
                  <Label>Team</Label>
                  <Select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
                    <option value="">Choose a team…</option>
                    {teams.data?.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </Select>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Title *</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Short summary"
                required
                minLength={3}
                maxLength={160}
              />
            </div>
            <div className="space-y-2">
              <Label>Description *</Label>
              <Textarea
                rows={6}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is happening, when, and what you've tried…"
                required
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex gap-2">
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? 'Raising…' : 'Raise ticket'}
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
