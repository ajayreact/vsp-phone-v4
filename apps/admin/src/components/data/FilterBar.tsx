'use client';

import { cn } from '../../lib/utils/cn';
import { Button } from '../ui/Button';

export function FilterBar({
  filters,
  active,
  onChange,
}: {
  filters: { id: string; label: string }[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {filters.map((f) => (
        <Button
          key={f.id}
          variant={active === f.id ? 'default' : 'outline'}
          size="sm"
          onClick={() => onChange(f.id)}
          className={cn('rounded-full')}
        >
          {f.label}
        </Button>
      ))}
    </div>
  );
}
