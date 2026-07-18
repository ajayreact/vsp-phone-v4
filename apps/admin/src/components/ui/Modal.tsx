'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from './Button';
import { cn } from '../../lib/utils/cn';

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'xl',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** lg ≈ form dialog; xl ≈ wide; full ≈ ~80vw configure workspace */
  size?: 'lg' | 'xl' | 'full';
}) {
  const widths = {
    lg: 'max-w-3xl w-[min(100%,48rem)]',
    xl: 'max-w-[min(1280px,92vw)] w-[92vw]',
    full: 'max-w-[min(1400px,80vw)] w-[min(100%,80vw)] max-sm:w-[96vw] max-sm:max-w-none',
  };

  const heights = {
    lg: 'max-h-[85vh]',
    xl: 'h-[90vh]',
    full: 'h-[88vh] max-sm:h-[92vh]',
  };

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            type="button"
            aria-label="Close dialog"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 bg-foreground/30 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className={cn(
              // Explicit height + flex column is required so the body can scroll.
              // h-0 + flex-1 forces the middle pane to take remaining space (min-h-0 alone is unreliable with framer-motion).
              'fixed left-1/2 top-[6vh] z-50 flex max-h-[94vh] -translate-x-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-elevated)]',
              widths[size],
              heights[size],
            )}
          >
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-6 py-4">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
                {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
              </div>
              <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="h-0 min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5">
              {children}
            </div>
            {footer ? (
              <div className="shrink-0 border-t border-border bg-muted/20 px-6 py-4">{footer}</div>
            ) : null}
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
