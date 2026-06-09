'use client';

import Link from 'next/link';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthStore } from '@/lib/auth-store';

export default function SettingsIndexPage() {
  const me = useAuthStore((s) => s.user);
  const isAdmin = me?.role === 'super_admin';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description={isAdmin ? 'Org-wide configuration and personal preferences.' : 'Personal preferences.'}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/settings/notifications" className="block">
          <Card className="h-full transition-colors hover:border-foreground/30">
            <CardHeader>
              <CardTitle className="text-base">Notification preferences</CardTitle>
              <CardDescription>Phone number and WhatsApp opt-in for alerts.</CardDescription>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">PRD §7.11</CardContent>
          </Card>
        </Link>
        {isAdmin && (
          <Link href="/settings/scoring" className="block">
            <Card className="h-full transition-colors hover:border-foreground/30">
              <CardHeader>
                <CardTitle className="text-base">Scoring engine</CardTitle>
                <CardDescription>Weights, thresholds, and timing for the performance score.</CardDescription>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">PRD §10</CardContent>
            </Card>
          </Link>
        )}
      </div>
    </div>
  );
}
