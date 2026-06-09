'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useGetUser, useUpdateUser } from '@/lib/api/users';
import { useAuthStore } from '@/lib/auth-store';

export default function NotificationPreferencesPage() {
  const me = useAuthStore((s) => s.user);
  const userQuery = useGetUser(me?.id);
  const update = useUpdateUser(me?.id ?? '');

  const [phone, setPhone] = useState('');
  const [whatsappEnabled, setWhatsappEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!userQuery.data) return;
    setPhone(userQuery.data.phone ?? '');
    setWhatsappEnabled(userQuery.data.whatsapp_enabled);
  }, [userQuery.data]);

  if (!me) return null;

  async function handleSave() {
    setError(null);
    setSuccess(null);
    if (whatsappEnabled && !phone.trim()) {
      setError('Add a phone number before enabling WhatsApp.');
      return;
    }
    try {
      await update.mutateAsync({
        phone: phone.trim() || undefined,
        whatsapp_enabled: whatsappEnabled,
      });
      setSuccess('Preferences saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save preferences');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notification preferences"
        description="Where DV-WMS reaches you with reminders, assignments, and updates."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Channels</CardTitle>
          <CardDescription>
            In-app notifications and email always go to your account email. WhatsApp is opt-in.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input value={me.email} disabled />
            <p className="text-xs text-muted-foreground">Set by your admin.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="phone">Phone (WhatsApp)</Label>
            <Input
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 98765 43210"
              inputMode="tel"
            />
            <p className="text-xs text-muted-foreground">
              Include country code. Used only for WhatsApp messages.
            </p>
          </div>

          <label className="flex items-start gap-3 rounded-md border bg-muted/30 p-3 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-primary"
              checked={whatsappEnabled}
              onChange={(e) => setWhatsappEnabled(e.target.checked)}
            />
            <span>
              <span className="font-medium">Send notifications to WhatsApp</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                We&apos;ll WhatsApp you for task assignments, ticket replies, follow-up nudges, and
                end-of-day reminders. Standard rates may apply.
              </span>
            </span>
          </label>

          {error && (
            <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          {success && (
            <p className="rounded-md border border-emerald-500/40 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
              {success}
            </p>
          )}

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={update.isPending || userQuery.isLoading}>
              {update.isPending ? 'Saving…' : 'Save preferences'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
