'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell,
  Headphones,
  LogOut,
  Moon,
  Plus,
  Search,
  Settings,
  Sun,
  User,
} from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthProvider';
import { displayNameFromSession } from '../../lib/rbac/permissions';
import { useTheme } from '../../lib/theme/ThemeProvider';
import { Avatar } from '../ui/Skeleton';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

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
    <header className="sticky top-0 z-40 flex h-16 items-center gap-4 border-b border-border bg-card/80 px-4 backdrop-blur-md sm:px-6">
      <div className="hidden min-w-0 flex-1 items-center gap-3 md:flex">
        <div className="relative w-full max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-10 border-transparent bg-muted/60 pl-9 shadow-none focus-visible:bg-card"
            placeholder="Search extensions, users, DIDs, devices…"
          />
          <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-border bg-card px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline">
            ⌘K
          </kbd>
        </div>
      </div>

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        {session?.tenant ? (
          <span className="hidden rounded-full border border-border bg-muted/50 px-3 py-1 text-xs font-medium lg:inline">
            {session.tenant.name}
          </span>
        ) : null}

        <Button variant="default" size="sm" className="hidden sm:inline-flex shadow-sm">
          <Plus className="h-4 w-4" />
          Quick Create
        </Button>

        <Link href="/softphone">
          <Button variant="outline" size="sm" title="Browser Softphone">
            <Headphones className="h-4 w-4" />
            <span className="hidden sm:inline">Softphone</span>
          </Button>
        </Link>

        <div className="relative">
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            onClick={() => setNotifOpen((v) => !v)}
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4" />
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary ring-2 ring-card" />
          </Button>
          <AnimatePresence>
            {notifOpen ? (
              <motion.div
                initial={{ opacity: 0, y: 4, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 4, scale: 0.98 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 z-50 mt-2 w-80 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-elevated)]"
              >
                <p className="text-sm font-semibold">Notifications</p>
                <p className="mt-3 text-sm text-muted-foreground">You&apos;re all caught up.</p>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle theme">
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>

        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 rounded-xl py-1 pl-1 pr-2 transition-colors hover:bg-muted/60"
          >
            <Avatar name={displayName} size="sm" />
            <span className="hidden max-w-[120px] truncate text-sm font-medium sm:inline">
              {displayName}
            </span>
          </button>
          <AnimatePresence>
            {menuOpen ? (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-elevated)]"
              >
                <div className="border-b border-border px-4 py-3">
                  <p className="truncate text-sm font-semibold">{displayName}</p>
                  <p className="truncate text-xs text-muted-foreground">{session?.email}</p>
                </div>
                <Link
                  href="/settings"
                  className="flex items-center gap-2 px-4 py-2.5 text-sm transition-colors hover:bg-muted/60"
                  onClick={() => setMenuOpen(false)}
                >
                  <User className="h-4 w-4 text-muted-foreground" />
                  Profile
                </Link>
                <Link
                  href="/settings"
                  className="flex items-center gap-2 px-4 py-2.5 text-sm transition-colors hover:bg-muted/60"
                  onClick={() => setMenuOpen(false)}
                >
                  <Settings className="h-4 w-4 text-muted-foreground" />
                  Settings
                </Link>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-destructive transition-colors hover:bg-muted/60"
                  onClick={handleLogout}
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}
