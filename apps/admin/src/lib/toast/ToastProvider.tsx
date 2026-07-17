'use client';

import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { cn } from '../utils/cn';

type ToastVariant = 'success' | 'error' | 'info';

type ToastItem = {
  id: string;
  variant: ToastVariant;
  title: string;
  description?: string;
};

type ToastOptions = {
  description?: string;
  /** Auto-dismiss delay in ms. Defaults to 4500ms (errors: 6000ms). */
  durationMs?: number;
};

type ToastApi = {
  success: (title: string, options?: ToastOptions) => string;
  error: (title: string, options?: ToastOptions) => string;
  info: (title: string, options?: ToastOptions) => string;
  dismiss: (id: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

const VARIANT_STYLES: Record<ToastVariant, { icon: typeof CheckCircle2; className: string; iconClassName: string }> = {
  success: {
    icon: CheckCircle2,
    className: 'border-success/30 bg-success/5',
    iconClassName: 'text-success',
  },
  error: {
    icon: XCircle,
    className: 'border-destructive/30 bg-destructive/5',
    iconClassName: 'text-destructive',
  },
  info: {
    icon: Info,
    className: 'border-border bg-card',
    iconClassName: 'text-muted-foreground',
  },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (variant: ToastVariant, title: string, options?: ToastOptions): string => {
      const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const item: ToastItem = { id, variant, title, description: options?.description };
      setToasts((prev) => [...prev, item].slice(-6));
      const duration = options?.durationMs ?? (variant === 'error' ? 6000 : 4500);
      const timer = setTimeout(() => dismiss(id), duration);
      timers.current.set(id, timer);
      return id;
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (title, options) => push('success', title, options),
      error: (title, options) => push('error', title, options),
      info: (title, options) => push('info', title, options),
      dismiss,
    }),
    [push, dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2"
      >
        {toasts.map((toast) => {
          const style = VARIANT_STYLES[toast.variant];
          const Icon = style.icon;
          return (
            <div
              key={toast.id}
              role="status"
              className={cn(
                'pointer-events-auto flex items-start gap-3 rounded-lg border p-3 shadow-lg backdrop-blur-sm animate-in slide-in-from-bottom-2',
                'bg-card/95',
                style.className,
              )}
            >
              <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', style.iconClassName)} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{toast.title}</p>
                {toast.description ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">{toast.description}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                aria-label="Dismiss notification"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

/** Access toast notifications. Every mutating action in the Extension Workspace should call this. */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
}
