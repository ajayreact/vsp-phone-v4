'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Bell,
  Headphones,
  LogOut,
  Moon,
  Search,
  Sun,
  User,
} from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthProvider';
import { displayNameFromSession } from '../../lib/rbac/permissions';
import { useTheme } from '../../lib/theme/ThemeProvider';
import { Avatar } from '../ui/Skeleton';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { useState } from 'react';

export function Header() {
  const { session, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const displayName = session
    ? displayNameFromSession(session.email, session.profile)
    : 'User';

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  return (
    <header className="flex h-14 items-center gap-4 border-b border-border bg-card px-4 sm:px-6">
      <div className="hidden min-w-0 flex-1 items-center gap-2 md:flex">
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search extensions, users, DIDs…" />
        </div>
      </div>
      <div className="ml-auto flex items-center gap-2">
        {session?.tenant ? (
          <span className="hidden rounded-md border border-border px-2.5 py-1 text-xs font-medium sm:inline">
            {session.tenant.name}
          </span>
        ) : null}
        <Link href="/softphone">
          <Button variant="ghost" size="sm" title="Browser Softphone">
            <Headphones className="h-4 w-4" />
            <span className="hidden sm:inline">Softphone</span>
          </Button>
        </Link>
        <div className="relative">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setNotifOpen((v) => !v)}
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4" />
          </Button>
          {notifOpen ? (
            <div className="absolute right-0 z-50 mt-2 w-72 rounded-lg border border-border bg-card p-3 shadow-none">
              <p className="text-sm font-medium">Notifications</p>
              <p className="mt-2 text-sm text-muted-foreground">No new notifications.</p>
            </div>
          ) : null}
        </div>
        <Button variant="ghost" size="sm" onClick={toggleTheme} aria-label="Toggle theme">
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-muted"
          >
            <Avatar name={displayName} />
            <span className="hidden text-sm font-medium sm:inline">{displayName}</span>
          </button>
          {menuOpen ? (
            <div className="absolute right-0 z-50 mt-2 w-56 rounded-lg border border-border bg-card py-1">
              <div className="border-b border-border px-3 py-2">
                <p className="text-sm font-medium">{displayName}</p>
                <p className="text-xs text-muted-foreground">{session?.email}</p>
              </div>
              <Link
                href="/settings"
                className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted"
                onClick={() => setMenuOpen(false)}
              >
                <User className="h-4 w-4" />
                Account settings
              </Link>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted"
                onClick={handleLogout}
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
