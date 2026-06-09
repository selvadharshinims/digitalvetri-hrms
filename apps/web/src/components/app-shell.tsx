'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CalendarDays,
  CheckSquare,
  ClipboardList,
  FolderKanban,
  Gauge,
  LayoutDashboard,
  LifeBuoy,
  LineChart,
  LogOut,
  Menu,
  Settings,
  Sparkles,
  Target,
  Users2,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { Role } from '@dv-wms/types';
import { Logo } from '@/components/logo';
import { NotificationBell } from '@/components/notification-bell';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { logout } from '@/lib/auth-actions';
import { useAuthStore } from '@/lib/auth-store';

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: Role[];
};

const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['super_admin', 'team_leader', 'intern'] },
  { href: '/users', label: 'Users', icon: Users, roles: ['super_admin'] },
  { href: '/teams', label: 'Teams', icon: Users2, roles: ['super_admin', 'team_leader'] },
  { href: '/leads', label: 'Leads', icon: Target, roles: ['super_admin', 'team_leader', 'intern'] },
  { href: '/projects', label: 'Projects', icon: FolderKanban, roles: ['super_admin', 'team_leader', 'intern'] },
  { href: '/tasks', label: 'Tasks', icon: CheckSquare, roles: ['super_admin', 'team_leader', 'intern'] },
  { href: '/attendance', label: 'Attendance', icon: CalendarDays, roles: ['super_admin', 'team_leader', 'intern'] },
  { href: '/daily-reports', label: 'Daily Reports', icon: ClipboardList, roles: ['super_admin', 'team_leader', 'intern'] },
  { href: '/performance', label: 'Performance', icon: Gauge, roles: ['super_admin', 'team_leader', 'intern'] },
  { href: '/tickets', label: 'Tickets', icon: LifeBuoy, roles: ['super_admin', 'team_leader', 'intern'] },
  { href: '/reports', label: 'Reports & Analytics', icon: LineChart, roles: ['super_admin', 'team_leader'] },
  { href: '/ask', label: 'Ask DV-WMS', icon: Sparkles, roles: ['super_admin', 'team_leader'] },
  { href: '/settings', label: 'Settings', icon: Settings, roles: ['super_admin', 'team_leader', 'intern'] },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const items = useMemo(
    () => NAV.filter((item) => (user ? item.roles.includes(user.role) : false)),
    [user],
  );

  // Close the drawer whenever the route changes.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // Lock body scroll while the drawer is open on mobile.
  useEffect(() => {
    if (drawerOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
    return undefined;
  }, [drawerOpen]);

  return (
    <div className="flex min-h-screen bg-muted/20">
      {/* Persistent sidebar (desktop) */}
      <aside className="hidden w-64 shrink-0 flex-col border-r bg-background md:flex">
        <SidebarContent items={items} pathname={pathname} user={user} />
      </aside>

      {/* Off-canvas drawer (mobile) */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-foreground/40 md:hidden"
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        />
      )}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r bg-background transition-transform duration-200 md:hidden',
          drawerOpen ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-hidden={!drawerOpen}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <Logo />
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
        <SidebarContent items={items} pathname={pathname} user={user} showHeader={false} />
      </aside>

      <main className="flex flex-1 flex-col">
        <div className="flex items-center justify-between gap-2 border-b bg-background/80 px-3 py-3 backdrop-blur md:px-10">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="md:hidden">
            <Logo size="sm" />
          </div>
          <div className="flex-1" />
          <NotificationBell />
        </div>
        <div className="flex-1 px-3 py-4 sm:px-6 sm:py-6 md:px-10">{children}</div>
      </main>
    </div>
  );
}

function SidebarContent({
  items,
  pathname,
  user,
  showHeader = true,
}: {
  items: NavItem[];
  pathname: string | null;
  user: ReturnType<typeof useAuthStore.getState>['user'];
  showHeader?: boolean;
}) {
  return (
    <>
      {showHeader && (
        <div className="px-4 py-4">
          <Logo />
        </div>
      )}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3">
        {items.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname?.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                active
                  ? 'bg-accent text-accent-foreground font-medium'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t p-3">
        {user && (
          <div className="mb-2 px-2 text-xs">
            <p className="truncate font-medium">{user.full_name}</p>
            <p className="truncate text-muted-foreground">{user.email}</p>
            <p className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
              {user.role.replace('_', ' ')}
            </p>
          </div>
        )}
        <Button variant="ghost" className="w-full justify-start" onClick={() => logout()}>
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </Button>
      </div>
    </>
  );
}
