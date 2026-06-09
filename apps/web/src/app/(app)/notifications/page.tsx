'use client';

import Link from 'next/link';
import { useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useListNotifications, useMarkRead } from '@/lib/api/notifications';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 25;

export default function NotificationsPage() {
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const list = useListNotifications({
    page,
    limit: PAGE_SIZE,
    unread_only: unreadOnly || undefined,
  });
  const markRead = useMarkRead();

  const totalPages = list.data
    ? Math.max(1, Math.ceil(list.data.meta.total / PAGE_SIZE))
    : 1;
  const unread = list.data?.meta.unread ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description={`${unread} unread`}
        actions={
          unread > 0 && (
            <Button
              variant="outline"
              onClick={() => markRead.mutate({ all: true })}
              disabled={markRead.isPending}
            >
              Mark all read
            </Button>
          )
        }
      />

      <div className="flex items-center gap-2">
        <Button
          variant={!unreadOnly ? 'default' : 'outline'}
          size="sm"
          onClick={() => {
            setUnreadOnly(false);
            setPage(1);
          }}
        >
          All
        </Button>
        <Button
          variant={unreadOnly ? 'default' : 'outline'}
          size="sm"
          onClick={() => {
            setUnreadOnly(true);
            setPage(1);
          }}
        >
          Unread
        </Button>
      </div>

      {list.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {list.data?.data.length === 0 && (
        <Card>
          <CardContent className="pt-6 text-center text-sm text-muted-foreground">
            Nothing here.
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {list.data?.data.map((n) => (
          <Card key={n.id} className={cn(!n.is_read && 'border-foreground/30 bg-accent/20')}>
            <CardContent className="pt-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-baseline gap-2">
                    <p className="font-medium">{n.title}</p>
                    {!n.is_read && <Badge variant="default">New</Badge>}
                    <Badge variant="muted" className="text-[10px]">
                      {n.type.replace(/_/g, ' ')}
                    </Badge>
                  </div>
                  {n.body && (
                    <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">
                      {n.body}
                    </p>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">
                    {new Date(n.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  {n.link && (
                    <Button size="sm" variant="outline" asChild>
                      <Link
                        href={n.link as never}
                        onClick={() => {
                          if (!n.is_read) markRead.mutate({ notification_ids: [n.id] });
                        }}
                      >
                        Open
                      </Link>
                    </Button>
                  )}
                  {!n.is_read && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => markRead.mutate({ notification_ids: [n.id] })}
                    >
                      Mark read
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <p>
          Page {page} of {totalPages} · {list.data?.meta.total ?? 0} total
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
    </div>
  );
}
