'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Notification } from '@dv-wms/types';
import { Button } from '@/components/ui/button';
import {
  useListNotifications,
  useMarkRead,
  useUnreadCount,
} from '@/lib/api/notifications';
import { cn } from '@/lib/utils';

export function NotificationBell() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const count = useUnreadCount();
  const list = useListNotifications({ limit: 8 });
  const markRead = useMarkRead();

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const unread = count.data?.unread ?? 0;

  function handleClickItem(n: Notification) {
    if (!n.is_read) {
      markRead.mutate({ notification_ids: [n.id] });
    }
    if (n.link) {
      router.push(n.link as never);
      setOpen(false);
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
      >
        <span className="relative inline-flex">
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </span>
      </Button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-80 overflow-hidden rounded-md border bg-card shadow-lg">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <p className="text-sm font-medium">Notifications</p>
            {unread > 0 && (
              <button
                onClick={() => markRead.mutate({ all: true })}
                className="text-xs text-primary hover:underline"
                disabled={markRead.isPending}
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {list.isLoading && (
              <p className="px-3 py-4 text-xs text-muted-foreground">Loading…</p>
            )}
            {list.data?.data.length === 0 && (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                You're all caught up.
              </p>
            )}
            {list.data?.data.map((n) => (
              <button
                key={n.id}
                onClick={() => handleClickItem(n)}
                className={cn(
                  'block w-full border-b px-3 py-2 text-left text-sm transition-colors hover:bg-accent',
                  !n.is_read && 'bg-accent/30',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium leading-tight">{n.title}</p>
                  {!n.is_read && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />}
                </div>
                {n.body && (
                  <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{n.body}</p>
                )}
                <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                  {new Date(n.created_at).toLocaleString()}
                </p>
              </button>
            ))}
          </div>
          <div className="border-t px-3 py-2">
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="text-xs text-primary hover:underline"
            >
              View all →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
