'use client';

import { Check, Copy, Loader2 } from 'lucide-react';
import type { ActivityEvent } from '../../../lib/hooks/queries/use-extension-activity';
import {
  buildDeviceDetailFields,
  filterDeviceActivityEvents,
  getRegistrationBadge,
  registrationBadgeClassName,
} from '../../../lib/devices/device-display';
import { cn } from '../../../lib/utils/cn';
import { Button } from '../../ui/Button';

export type DevicePendingAction = 'reprovision' | 'reset' | 'remove' | null;

type CurrentDeviceCardProps = {
  device: Record<string, unknown>;
  enrichedDevice: Record<string, unknown> | null;
  detailLoading: boolean;
  pendingAction: DevicePendingAction;
  replaceMode: boolean;
  anyActionBusy: boolean;
  copiedProvUrl: boolean;
  activityEvents: ActivityEvent[];
  onReprovision: () => void;
  onReset: () => void;
  onReplace: () => void;
  onRemove: () => void;
  onCopyProvUrl: (url: string) => void;
};

function ActionButton({
  label,
  pendingLabel,
  isPending,
  disabled,
  onClick,
}: {
  label: string;
  pendingLabel: string;
  isPending: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={disabled}
      aria-busy={isPending}
      aria-label={isPending ? pendingLabel : label}
      onClick={onClick}
    >
      {isPending ? (
        <>
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          {pendingLabel}
        </>
      ) : (
        label
      )}
    </Button>
  );
}

export function CurrentDeviceCard({
  device,
  enrichedDevice,
  detailLoading,
  pendingAction,
  replaceMode,
  anyActionBusy,
  copiedProvUrl,
  activityEvents,
  onReprovision,
  onReset,
  onReplace,
  onRemove,
  onCopyProvUrl,
}: CurrentDeviceCardProps) {
  const registration = getRegistrationBadge(device);
  const detailFields = buildDeviceDetailFields(device, enrichedDevice);
  const deviceActivity = filterDeviceActivityEvents(activityEvents);
  const provUrlField = detailFields.find((field) => field.id === 'provUrl');
  const gridFields = detailFields.filter((field) => field.id !== 'provUrl');

  return (
    <section
      className="rounded-xl border border-border bg-card p-4 sm:p-5"
      aria-labelledby="current-device-heading"
      aria-busy={detailLoading}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-3">
          <div>
            <h3 id="current-device-heading" className="text-sm font-medium text-muted-foreground">
              Current Device
            </h3>
            <p className="mt-1 text-lg font-semibold tracking-tight">
              {[formatTitleManufacturer(device.manufacturer), String(device.model ?? '').trim()]
                .filter(Boolean)
                .join(' ') || 'Desk Phone'}
            </p>
          </div>

          <div
            className={cn(
              'inline-flex items-center gap-2 rounded-full bg-muted/50 px-3 py-1 text-sm font-medium',
              registrationBadgeClassName(registration.tone),
            )}
            role="status"
            aria-label={`Registration status: ${registration.label}`}
          >
            <span aria-hidden="true">{registration.emoji}</span>
            <span>{registration.label}</span>
          </div>
        </div>

        {!replaceMode ? (
          <div
            className="flex flex-wrap gap-2 lg:max-w-xl lg:justify-end"
            role="group"
            aria-label="Device actions"
          >
            <ActionButton
              label="Reprovision"
              pendingLabel="Reprovisioning…"
              isPending={pendingAction === 'reprovision'}
              disabled={anyActionBusy}
              onClick={onReprovision}
            />
            <ActionButton
              label="Reset Provisioning"
              pendingLabel="Resetting…"
              isPending={pendingAction === 'reset'}
              disabled={anyActionBusy}
              onClick={onReset}
            />
            <ActionButton
              label="Replace Device"
              pendingLabel="Replace Device"
              isPending={false}
              disabled={anyActionBusy}
              onClick={onReplace}
            />
            <ActionButton
              label="Remove Device"
              pendingLabel="Removing…"
              isPending={pendingAction === 'remove'}
              disabled={anyActionBusy}
              onClick={onRemove}
            />
          </div>
        ) : null}
      </div>

      {detailLoading ? (
        <p className="mt-4 text-sm text-muted-foreground" aria-live="polite">
          Loading device details…
        </p>
      ) : gridFields.length ? (
        <dl className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {gridFields.map((field) => (
            <div key={field.id} className="min-w-0">
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{field.label}</dt>
              <dd className={cn('mt-1 break-all text-sm', field.mono && 'font-mono text-xs')}>{field.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {provUrlField ? (
        <div className="mt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{provUrlField.label}</p>
          <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center">
            <code className="block min-w-0 flex-1 break-all rounded-lg bg-muted/40 px-3 py-2 text-xs">
              {provUrlField.value}
            </code>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              aria-label="Copy provisioning URL"
              onClick={() => onCopyProvUrl(provUrlField.value)}
            >
              {copiedProvUrl ? (
                <>
                  <Check className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  Copy URL
                </>
              )}
            </Button>
          </div>
        </div>
      ) : null}

      {deviceActivity.length ? (
        <div className="mt-5 border-t border-border pt-4">
          <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Recent Device Activity</h4>
          <ul className="mt-2 space-y-2" aria-label="Recent device activity">
            {deviceActivity.map((event) => (
              <li key={event.id} className="flex flex-col gap-0.5 text-sm sm:flex-row sm:items-center sm:justify-between">
                <span className="font-medium">{event.label}</span>
                <time className="text-xs text-muted-foreground" dateTime={event.at}>
                  {new Date(event.at).toLocaleString()}
                </time>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function formatTitleManufacturer(manufacturer: unknown): string {
  const raw = String(manufacturer ?? '').trim();
  if (!raw) return '';
  return raw.charAt(0) + raw.slice(1).toLowerCase();
}
