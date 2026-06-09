'use client';

import Link from 'next/link';
import { useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCreateTeam, useListTeams } from '@/lib/api/teams';
import { useAuthStore } from '@/lib/auth-store';

export default function TeamsPage() {
  const me = useAuthStore((s) => s.user);
  const canCreate = me?.role === 'super_admin';
  const teamsQuery = useListTeams();
  const createTeam = useCreateTeam();

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await createTeam.mutateAsync({
        name: name.trim(),
        category: category.trim() || undefined,
        description: description.trim() || undefined,
      });
      setName('');
      setCategory('');
      setDescription('');
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Teams"
        description="Functional pods inside DigitalVetri."
        actions={
          canCreate && (
            <Button onClick={() => setShowForm((s) => !s)}>
              {showForm ? 'Cancel' : 'New team'}
            </Button>
          )
        }
      />

      {showForm && canCreate && (
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle className="text-base">Create a team</CardTitle>
            <CardDescription>You can assign a leader and members afterwards.</CardDescription>
          </CardHeader>
          <form onSubmit={handleCreate}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Input value={category} onChange={(e) => setCategory(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" disabled={createTeam.isPending}>
                {createTeam.isPending ? 'Creating…' : 'Create team'}
              </Button>
            </CardContent>
          </form>
        </Card>
      )}

      {teamsQuery.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {teamsQuery.isError && (
        <p className="text-sm text-destructive">{(teamsQuery.error as Error).message}</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {teamsQuery.data?.map((team) => (
          <Link key={team.id} href={`/teams/${team.id}`} className="block group">
            <Card className="h-full transition-colors group-hover:border-foreground/30">
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{team.name}</CardTitle>
                  {!team.is_active && <Badge variant="warning">archived</Badge>}
                </div>
                {team.category && (
                  <CardDescription className="uppercase tracking-wider text-[10px]">
                    {team.category}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {team.description && (
                  <p className="text-muted-foreground line-clamp-2">{team.description}</p>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Leader</span>
                  <span className="font-medium">
                    {team.leader ? team.leader.full_name : <span className="text-muted-foreground">—</span>}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Members</span>
                  <span>{team._count.members}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Projects</span>
                  <span>{team._count.projects}</span>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
