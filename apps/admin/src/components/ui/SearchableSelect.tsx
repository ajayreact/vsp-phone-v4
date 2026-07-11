'use client';

import { ChevronDown, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '../../lib/utils/cn';

export type SearchableOption = { value: string; label: string; group?: string };

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Select…',
  required,
  disabled,
  className,
}: {
  options: SearchableOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q),
    );
  }, [options, query]);

  const groups = useMemo(() => {
    const map = new Map<string, SearchableOption[]>();
    for (const opt of filtered) {
      const key = opt.group ?? '';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(opt);
    }
    return map;
  }, [filtered]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        type="button"
        disabled={disabled}
        aria-required={required}
        className="flex h-10 w-full items-center justify-between rounded-xl border border-border bg-background px-3 text-left text-sm disabled:opacity-50"
        onClick={() => setOpen((v) => !v)}
      >
        <span className={cn('truncate', !selected && 'text-muted-foreground')}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
      {open ? (
        <div className="absolute z-50 mt-1 max-h-64 w-full overflow-hidden rounded-xl border border-border bg-card shadow-lg">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              autoFocus
              className="w-full bg-transparent text-sm outline-none"
              placeholder="Search…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="max-h-48 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">No matches</p>
            ) : (
              Array.from(groups.entries()).map(([group, items]) => (
                <div key={group || 'default'}>
                  {group ? (
                    <p className="px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {group}
                    </p>
                  ) : null}
                  {items.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      className={cn(
                        'block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-muted',
                        opt.value === value && 'bg-primary/10 font-medium text-primary',
                      )}
                      onClick={() => {
                        onChange(opt.value);
                        setOpen(false);
                        setQuery('');
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
