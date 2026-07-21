'use client';

import {
  Archive,
  ArchiveRestore,
  Copy,
  KeyRound,
  Phone,
  Power,
  PowerOff,
  QrCode,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';
import type { ExtensionHubRow } from '../../../lib/hooks/queries/use-extension-hub';
import { ActionDropdown, type ActionItem } from '../../data/ActionDropdown';
import { Button } from '../../ui/Button';

export type QuickActionHandlers = {
  onOpenSoftphone: () => void;
  onCopyExtension: () => void;
  onCopySipUsername: () => void;
  onCopyProvisionUrl: () => void;
  onGenerateQr: () => void;
  onResetSipPassword: () => void;
  onRestartRegistration: () => void;
  onReProvisionDevice: () => void;
  onRebootDeskPhone: () => void;
  onDisableExtension: () => void;
  onEnableExtension: () => void;
  onArchiveExtension: () => void;
  onUnarchiveExtension: () => void;
};

/** Header dropdown — every applicable action for this extension, without leaving the Configure modal. */
export function ExtensionQuickActionsMenu({
  row,
  handlers,
  disabled,
}: {
  row: ExtensionHubRow;
  handlers: QuickActionHandlers;
  disabled?: boolean;
}) {
  const archived = Boolean(row.archived);
  const lineDisabled = row.lineStatus === 'INACTIVE';
  const hasSip = Boolean(row.did) || row.hasMobileApp || row.hasDeskPhone;
  const hasDeskPhone = row.hasDeskPhone;

  const allItems: ActionItem[] = [
    { id: 'open-softphone', label: 'Open Softphone', icon: <Phone className="h-4 w-4" />, onSelect: handlers.onOpenSoftphone },
    { id: 'copy-extension', label: 'Copy Extension', icon: <Copy className="h-4 w-4" />, onSelect: handlers.onCopyExtension },
    { id: 'copy-sip-username', label: 'Copy SIP Username', icon: <Copy className="h-4 w-4" />, onSelect: handlers.onCopySipUsername },
    { id: 'copy-provision-url', label: 'Copy Provision URL', icon: <Copy className="h-4 w-4" />, onSelect: handlers.onCopyProvisionUrl },
    { id: 'generate-qr', label: 'Generate QR Code', icon: <QrCode className="h-4 w-4" />, onSelect: handlers.onGenerateQr },
    { id: 'reset-sip-password', label: 'Reset SIP Password', icon: <KeyRound className="h-4 w-4" />, onSelect: handlers.onResetSipPassword },
    { id: 'restart-registration', label: 'Restart Registration', icon: <RotateCcw className="h-4 w-4" />, onSelect: handlers.onRestartRegistration },
    { id: 're-provision', label: 'Re-Provision Device', icon: <RefreshCw className="h-4 w-4" />, onSelect: handlers.onReProvisionDevice },
    { id: 'reboot-desk-phone', label: 'Reboot Desk Phone', icon: <RotateCcw className="h-4 w-4" />, onSelect: handlers.onRebootDeskPhone },
    { id: 'disable-extension', label: 'Disable Extension', icon: <PowerOff className="h-4 w-4" />, onSelect: handlers.onDisableExtension, destructive: true },
    { id: 'enable-extension', label: 'Enable Extension', icon: <Power className="h-4 w-4" />, onSelect: handlers.onEnableExtension },
    { id: 'archive-extension', label: 'Deactivate Extension', icon: <Archive className="h-4 w-4" />, onSelect: handlers.onArchiveExtension, destructive: true },
    { id: 'unarchive-extension', label: 'Reactivate Extension', icon: <ArchiveRestore className="h-4 w-4" />, onSelect: handlers.onUnarchiveExtension },
  ];

  const visible = new Set<string>(['open-softphone', 'copy-extension']);
  if (hasSip) visible.add('copy-sip-username');
  if (hasDeskPhone) visible.add('copy-provision-url');
  if (!archived) visible.add('generate-qr');
  if (hasSip && !archived) visible.add('reset-sip-password');
  if (!archived && !lineDisabled) visible.add('restart-registration');
  if (hasDeskPhone && !archived) visible.add('re-provision');
  if (hasDeskPhone && !archived) visible.add('reboot-desk-phone');
  if (!archived && !lineDisabled) visible.add('disable-extension');
  if (!archived && lineDisabled) visible.add('enable-extension');
  if (!archived) visible.add('archive-extension');
  if (archived) visible.add('unarchive-extension');

  const items: ActionItem[] = allItems.filter((item) => visible.has(item.id));

  return (
    <ActionDropdown
      items={items}
      trigger={
        <Button variant="outline" size="sm" disabled={disabled}>
          Quick Actions
        </Button>
      }
    />
  );
}
