'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { MoreHorizontal } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '../ui/Button';
import { cn } from '../../lib/utils/cn';

export type ActionItem = {
  id: string;
  label: string;
  icon?: ReactNode;
  destructive?: boolean;
  onSelect?: () => void;
};

export function ActionDropdown({
  items,
  align = 'end',
  trigger,
}: {
  items: ActionItem[];
  align?: 'start' | 'end';
  /** Custom trigger element. Defaults to the compact "..." icon button. */
  trigger?: ReactNode;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        {trigger ?? (
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Actions">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        )}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align={align}
          sideOffset={4}
          className={cn(
            'z-50 min-w-[160px] overflow-hidden rounded-xl border border-border bg-card p-1 shadow-[var(--shadow-elevated)]',
            'animate-in fade-in-0 zoom-in-95 duration-150',
          )}
        >
          {items.map((item) => (
            <DropdownMenu.Item
              key={item.id}
              onSelect={item.onSelect}
              className={cn(
                'flex cursor-pointer select-none items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none',
                'focus:bg-muted data-[highlighted]:bg-muted',
                item.destructive && 'text-destructive focus:text-destructive',
              )}
            >
              {item.icon}
              {item.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
