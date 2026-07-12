'use client';

import { Check, Copy, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ExtensionHubRow, ExtensionMobileQrResult } from '../../../lib/hooks/queries/use-extension-hub';
import { Button } from '../../ui/Button';
import { Skeleton } from '../../ui/Skeleton';

export function ExtensionQrPanel({
  row,
  qr,
  loading,
  onRegenerate,
  hasExistingMobile = false,
}: {
  row: ExtensionHubRow;
  qr: ExtensionMobileQrResult | null;
  loading: boolean;
  onRegenerate: () => void;
  hasExistingMobile?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!qr?.expiresAt) {
      setSecondsLeft(null);
      return;
    }
    const tick = () => {
      const left = Math.max(0, Math.floor((new Date(qr.expiresAt).getTime() - Date.now()) / 1000));
      setSecondsLeft(left);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [qr?.expiresAt]);

  const copyLink = async () => {
    if (!qr?.deepLink) return;
    await navigator.clipboard.writeText(qr.deepLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const mins = secondsLeft !== null ? Math.floor(secondsLeft / 60) : qr?.expiresInMinutes ?? 10;

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm">
        <p className="font-medium">{row.label}</p>
        <p className="mt-1 text-muted-foreground">
          {hasExistingMobile
            ? 'Your mobile app is registered. View the current QR or regenerate a new one.'
            : 'Scan this QR code with your phone to register the mobile app.'}
        </p>
      </div>

      {loading && !qr?.qrDataUrl ? (
        <p className="text-center text-sm text-muted-foreground">
          {hasExistingMobile ? 'Loading current QR…' : 'Generating QR…'}
        </p>
      ) : null}

      {loading ? <Skeleton className="mx-auto h-64 w-64 rounded-xl" /> : null}

      {qr?.qrDataUrl ? (
        <div className="flex flex-col items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qr.qrDataUrl}
            alt={`QR code for ${row.label}`}
            className="h-64 w-64 rounded-xl border border-border bg-white p-2"
          />
          <p className="text-sm text-muted-foreground">
            Expires in {secondsLeft !== null && secondsLeft < 120 ? `${secondsLeft}s` : `${mins} minutes`}
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => void copyLink()} disabled={!qr?.deepLink}>
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          Copy Enroll Link
        </Button>
        <Button size="sm" variant="outline" onClick={onRegenerate} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          {hasExistingMobile ? 'Regenerate QR' : 'Generate QR'}
        </Button>
      </div>

      <div className="rounded-xl border border-border p-4 text-xs text-muted-foreground">
        <p className="mb-2 font-medium text-foreground">Supported clients</p>
        <ul className="space-y-1">
          <li>WebRTC softphone (browser enroll token)</li>
          <li>Native app deep link: <span className="font-mono">vspphone://enroll</span></li>
        </ul>
      </div>
    </div>
  );
}
