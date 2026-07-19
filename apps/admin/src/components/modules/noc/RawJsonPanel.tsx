'use client';

type RawJsonPanelProps = {
  data: unknown;
  title?: string;
};

export function RawJsonPanel({ data, title = 'Show Raw Diagnostics' }: RawJsonPanelProps) {
  return (
    <details className="group rounded-2xl border border-border bg-card/60">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-muted-foreground marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-2">
          <span className="text-xs text-muted-foreground transition group-open:rotate-90">▸</span>
          {title}
        </span>
      </summary>
      <pre className="max-h-[420px] overflow-auto border-t border-border bg-muted/30 p-4 text-xs leading-relaxed">
        {JSON.stringify(data, null, 2)}
      </pre>
    </details>
  );
}
