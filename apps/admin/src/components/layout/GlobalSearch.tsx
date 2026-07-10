'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { usePlatformSearch } from '../../lib/hooks/queries/use-platform';
import { Input } from '../ui/Input';

export function GlobalSearch() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const debounced = useDebouncedValue(query, 250);
  const { data: results = [], isFetching } = usePlatformSearch(debounced, open && debounced.length >= 2);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        containerRef.current?.querySelector('input')?.focus();
        setOpen(true);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div ref={containerRef} className="relative w-full max-w-xl">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        className="h-10 border-transparent bg-muted/60 pl-9 shadow-none focus-visible:bg-card"
        placeholder="Search numbers, tenants, extensions, trunks…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-border bg-card px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline">
        ⌘K
      </kbd>

      {open && debounced.length >= 2 ? (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-elevated)]">
          {isFetching ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">Searching…</p>
          ) : results.length ? (
            <ul className="max-h-80 overflow-y-auto py-1">
              {results.map((item) => (
                <li key={`${item.type}-${item.id}`}>
                  <button
                    type="button"
                    className="flex w-full flex-col items-start px-4 py-2.5 text-left transition-colors hover:bg-muted/60"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setOpen(false);
                      setQuery('');
                      router.push(item.href);
                    }}
                  >
                    <span className="text-sm font-medium">{item.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {item.type} · {item.subtitle}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-3 text-sm text-muted-foreground">No results for &ldquo;{debounced}&rdquo;</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}
