'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuthStore, useHydrated } from '@/lib/auth-store';

export default function Home() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const hydrated = useHydrated();

  useEffect(() => {
    if (!hydrated) return;
    router.replace(user ? '/dashboard' : '/login');
  }, [hydrated, user, router]);

  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
      Loading…
    </div>
  );
}
