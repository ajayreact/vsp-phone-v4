'use client';

import {
  Download,
  Eye,
  Flag,
  Mail,
  Pencil,
  Play,
  Trash2,
  Voicemail as VoicemailIcon,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { usePermissions } from '../../lib/auth/AuthProvider';
import {
  useCreateVoicemailMailbox,
  useDeleteVoicemailMailbox,
  useUpdateVoicemailMailbox,
  useVoicemailMailboxes,
  useVoicemailMessageActions,
  useVoicemailMessagePlayback,
  useVoicemailMessages,
  useVoicemailReports,
} from '../../lib/hooks/queries/use-vcr-communications';
import { PERMISSIONS, hasPermission } from '../../lib/rbac/permissions';
import type { Column } from '../data/DataTable';
import { DataTable } from '../data/DataTable';
import { EmptyState } from '../data/EmptyState';
import { MetricCard } from '../data/MetricCard';
import { QueryState } from '../feedback/QueryState';
import { PageContainer, PageHeader } from '../layout/PageHeader';
import { StatusBadge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { SlideOver } from '../ui/SlideOver';
import { Skeleton } from '../ui/Skeleton';
import { ModuleAccessGate } from './shared/ModuleShell';
import { useLineOptionsFromDevices, WriteCreateButton } from './shared/TenantCreateForms';
import { useTenantDevices } from '../../lib/hooks/queries/use-tenant';

type MailboxRow = Record<string, unknown> & { id: string };
type MessageRow = Record<string, unknown> & { id: string };

const MAILBOX_TYPES = ['PERSONAL', 'SHARED', 'DEPARTMENT', 'QUEUE', 'RING_GROUP', 'CONFERENCE'] as const;

type MailboxForm = {
  name: string;
  mailboxType: string;
  mailboxNumber: string;
  lineId: string;
  pin: string;
  emailNotify: string;
  language: string;
  timezone: string;
  retentionDays: string;
  storageQuotaMb: string;
  transcriptionReady: boolean;
  emailAttach: boolean;
  emailDeleteAfter: boolean;
};

const emptyForm: MailboxForm = {
  name: '',
  mailboxType: 'PERSONAL',
  mailboxNumber: '',
  lineId: '',
  pin: '',
  emailNotify: '',
  language: 'en-US',
  timezone: 'UTC',
  retentionDays: '30',
  storageQuotaMb: '100',
  transcriptionReady: false,
  emailAttach: true,
  emailDeleteAfter: false,
};

export function VoicemailContent() {
  const permissions = usePermissions();
  const canWrite = hasPermission(permissions, PERMISSIONS.TENANT_VOICEMAIL_WRITE);

  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messageSearch, setMessageSearch] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [selectedMessages, setSelectedMessages] = useState<string[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [editRow, setEditRow] = useState<MailboxRow | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);

  const mailboxesQuery = useVoicemailMailboxes(search || undefined);
  const reportsQuery = useVoicemailReports();
  const messagesQuery = useVoicemailMessages(selectedId ?? undefined, {
    search: messageSearch || undefined,
    unreadOnly,
    limit: 200,
  });
  const devicesQuery = useTenantDevices();
  const lineOptions = useLineOptionsFromDevices(devicesQuery.data ?? []);

  const create = useCreateVoicemailMailbox();
  const update = useUpdateVoicemailMailbox();
  const remove = useDeleteVoicemailMailbox();
  const playback = useVoicemailMessagePlayback();
  const messageActions = useVoicemailMessageActions();

  const mailboxes = (mailboxesQuery.data ?? []) as MailboxRow[];
  const messages = (messagesQuery.data ?? []) as MessageRow[];
  const reports = reportsQuery.data as Record<string, unknown> | undefined;

  const mailboxColumns: Column<MailboxRow>[] = useMemo(
    () => [
      { key: 'name', header: 'Mailbox', sortable: true, cell: (r) => <span className="font-medium">{String(r.name ?? r.mailboxNumber ?? '—')}</span> },
      { key: 'type', header: 'Type', cell: (r) => String(r.mailboxType ?? 'PERSONAL') },
      { key: 'number', header: 'Number', cell: (r) => String(r.mailboxNumber ?? '—') },
      {
        key: 'unread',
        header: 'Unread',
        cell: (r) => String((r._count as { messages?: number })?.messages ?? 0),
      },
      { key: 'status', header: 'Status', cell: (r) => <StatusBadge status={String(r.status ?? 'ACTIVE') === 'ACTIVE' ? 'active' : 'offline'} /> },
      {
        key: 'actions',
        header: '',
        cell: (r) => (
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={() => setSelectedId(r.id)}><Eye className="h-4 w-4" /></Button>
            {canWrite ? (
              <>
                <Button variant="ghost" size="sm" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                <Button variant="ghost" size="sm" onClick={() => void remove.mutateAsync(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </>
            ) : null}
          </div>
        ),
      },
    ],
    [canWrite, remove],
  );

  const messageColumns: Column<MessageRow>[] = useMemo(
    () => [
      { key: 'caller', header: 'Caller', cell: (r) => String(r.callerNumber ?? r.callerName ?? '—') },
      { key: 'duration', header: 'Duration', cell: (r) => `${String(r.durationSeconds ?? 0)}s` },
      { key: 'created', header: 'Received', cell: (r) => (r.createdAt ? new Date(String(r.createdAt)).toLocaleString() : '—') },
      {
        key: 'read',
        header: 'Status',
        cell: (r) => (
          <StatusBadge status={r.readAt ? 'active' : 'pending'} />
        ),
      },
      {
        key: 'flag',
        header: 'Flag',
        cell: (r) => (r.flagged ? <Flag className="h-4 w-4 text-amber-500" /> : '—'),
      },
    ],
    [],
  );

  const openEdit = (row: MailboxRow) => {
    setForm({
      name: String(row.name ?? ''),
      mailboxType: String(row.mailboxType ?? 'PERSONAL'),
      mailboxNumber: String(row.mailboxNumber ?? ''),
      lineId: String(row.lineId ?? ''),
      pin: '',
      emailNotify: String(row.emailNotify ?? ''),
      language: String(row.language ?? 'en-US'),
      timezone: String(row.timezone ?? 'UTC'),
      retentionDays: String(row.retentionDays ?? '30'),
      storageQuotaMb: String(row.storageQuotaMb ?? '100'),
      transcriptionReady: Boolean(row.transcriptionReady),
      emailAttach: row.emailAttach !== false,
      emailDeleteAfter: Boolean(row.emailDeleteAfter),
    });
    setEditRow(row);
    setError(null);
  };

  const formPayload = () => ({
    name: form.name || undefined,
    mailboxType: form.mailboxType,
    mailboxNumber: form.mailboxNumber || undefined,
    lineId: form.lineId || undefined,
    pin: form.pin || undefined,
    emailNotify: form.emailNotify || undefined,
    language: form.language,
    timezone: form.timezone,
    retentionDays: Number(form.retentionDays) || undefined,
    storageQuotaMb: Number(form.storageQuotaMb) || undefined,
    transcriptionReady: form.transcriptionReady,
    emailAttach: form.emailAttach,
    emailDeleteAfter: form.emailDeleteAfter,
  });

  const handleCreate = async () => {
    setError(null);
    try {
      await create.mutateAsync(formPayload());
      setCreateOpen(false);
      setForm(emptyForm);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed');
    }
  };

  const handleUpdate = async () => {
    if (!editRow) return;
    setError(null);
    try {
      await update.mutateAsync({ id: editRow.id, payload: formPayload() });
      setEditRow(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    }
  };

  const selectedMailbox = mailboxes.find((m) => m.id === selectedId);

  const mailboxFormFields = (
    <div className="space-y-4">
      <label className="block text-sm">
        <span className="text-muted-foreground">Name</span>
        <Input className="mt-1" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
      </label>
      <label className="block text-sm">
        <span className="text-muted-foreground">Mailbox Type</span>
        <select
          className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
          value={form.mailboxType}
          onChange={(e) => setForm((f) => ({ ...f, mailboxType: e.target.value }))}
        >
          {MAILBOX_TYPES.map((t) => (
            <option key={t} value={t}>{t.replace('_', ' ')}</option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="text-muted-foreground">Mailbox Number</span>
        <Input className="mt-1" value={form.mailboxNumber} onChange={(e) => setForm((f) => ({ ...f, mailboxNumber: e.target.value }))} />
      </label>
      <label className="block text-sm">
        <span className="text-muted-foreground">Line</span>
        <select
          className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
          value={form.lineId}
          onChange={(e) => setForm((f) => ({ ...f, lineId: e.target.value }))}
        >
          <option value="">— None —</option>
          {lineOptions.map((o) => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="text-muted-foreground">PIN</span>
        <Input className="mt-1" type="password" value={form.pin} onChange={(e) => setForm((f) => ({ ...f, pin: e.target.value }))} />
      </label>
      <label className="block text-sm">
        <span className="text-muted-foreground">Email Notification</span>
        <Input className="mt-1" value={form.emailNotify} onChange={(e) => setForm((f) => ({ ...f, emailNotify: e.target.value }))} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="text-muted-foreground">Language</span>
          <Input className="mt-1" value={form.language} onChange={(e) => setForm((f) => ({ ...f, language: e.target.value }))} />
        </label>
        <label className="block text-sm">
          <span className="text-muted-foreground">Timezone</span>
          <Input className="mt-1" value={form.timezone} onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))} />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="text-muted-foreground">Retention (days)</span>
          <Input className="mt-1" value={form.retentionDays} onChange={(e) => setForm((f) => ({ ...f, retentionDays: e.target.value }))} />
        </label>
        <label className="block text-sm">
          <span className="text-muted-foreground">Storage Quota (MB)</span>
          <Input className="mt-1" value={form.storageQuotaMb} onChange={(e) => setForm((f) => ({ ...f, storageQuotaMb: e.target.value }))} />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.emailAttach} onChange={(e) => setForm((f) => ({ ...f, emailAttach: e.target.checked }))} />
        Email attachment
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.emailDeleteAfter} onChange={(e) => setForm((f) => ({ ...f, emailDeleteAfter: e.target.checked }))} />
        Delete after email
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.transcriptionReady} onChange={(e) => setForm((f) => ({ ...f, transcriptionReady: e.target.checked }))} />
        Transcription ready
      </label>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );

  return (
    <ModuleAccessGate moduleId="voicemail">
      {({ module }) => (
        <PageContainer>
          <PageHeader
            title={module.label}
            description={module.description}
            actions={
              canWrite ? (
                <WriteCreateButton
                  writePermission={PERMISSIONS.TENANT_VOICEMAIL_WRITE}
                  label="Add Mailbox"
                  onClick={() => { setCreateOpen(true); setForm(emptyForm); setError(null); }}
                />
              ) : undefined
            }
          />

          <QueryState
            isLoading={reportsQuery.isLoading}
            isError={reportsQuery.isError}
            error={reportsQuery.error}
            skeleton={<Skeleton className="mb-6 h-24 w-full max-w-3xl rounded-2xl" />}
          >
            <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard label="Mailboxes" value={Number(reports?.mailboxCount ?? mailboxes.length)} icon={VoicemailIcon} />
              <MetricCard label="Unread Messages" value={Number(reports?.unreadCount ?? 0)} icon={Mail} />
              <MetricCard label="Storage Used (MB)" value={Number(reports?.storageUsedMb ?? 0)} icon={Download} />
              <MetricCard label="Messages (30d)" value={Number(reports?.messagesLast30Days ?? 0)} icon={VoicemailIcon} />
            </div>
          </QueryState>

          <div className="mb-4">
            <Input
              placeholder="Search mailboxes…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-md"
            />
          </div>

          <QueryState
            isLoading={mailboxesQuery.isLoading}
            isError={mailboxesQuery.isError}
            error={mailboxesQuery.error}
            onRetry={() => void mailboxesQuery.refetch()}
            skeleton={<Skeleton className="h-64 rounded-2xl" />}
          >
            {mailboxes.length === 0 ? (
              <EmptyState title="No voicemail boxes" description="Configure mailboxes for extensions, queues, and departments." icon={VoicemailIcon} />
            ) : (
              <DataTable columns={mailboxColumns} data={mailboxes} pageSize={10} />
            )}
          </QueryState>

          {selectedId && selectedMailbox ? (
            <div className="mt-8 space-y-4 rounded-2xl border border-border p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold">{String(selectedMailbox.name ?? 'Mailbox')}</h3>
                  <p className="text-sm text-muted-foreground">Messages for {String(selectedMailbox.mailboxNumber ?? selectedId)}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setSelectedId(null)}>Close</Button>
              </div>

              <div className="flex flex-wrap gap-3">
                <Input
                  placeholder="Search messages…"
                  value={messageSearch}
                  onChange={(e) => setMessageSearch(e.target.value)}
                  className="max-w-xs"
                />
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} />
                  Unread only
                </label>
                {canWrite && selectedMessages.length > 0 ? (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => void messageActions.mutateAsync({ type: 'bulkRead', messageIds: selectedMessages })}>Mark read</Button>
                    <Button size="sm" variant="outline" onClick={() => void messageActions.mutateAsync({ type: 'bulkDelete', messageIds: selectedMessages })}>Bulk delete</Button>
                  </div>
                ) : null}
              </div>

              <QueryState
                isLoading={messagesQuery.isLoading}
                isError={messagesQuery.isError}
                error={messagesQuery.error}
                skeleton={<Skeleton className="h-48 rounded-xl" />}
              >
                {messages.length === 0 ? (
                  <EmptyState title="No messages" description="New voicemail messages will appear here." icon={VoicemailIcon} />
                ) : (
                  <DataTable
                    columns={messageColumns}
                    data={messages}
                    pageSize={10}
                    selectable={canWrite}
                    selectedIds={selectedMessages}
                    onSelectionChange={setSelectedMessages}
                    rowActions={(row) => [
                      {
                        id: 'play',
                        label: 'Play',
                        icon: <Play className="h-3.5 w-3.5" />,
                        onSelect: () => {
                          void playback.mutateAsync({ voicemailId: selectedId, messageId: row.id }).then((res) => {
                            if (res.url) window.open(res.url, '_blank', 'noopener,noreferrer');
                          });
                        },
                      },
                      ...(canWrite
                        ? [
                            {
                              id: 'flag',
                              label: 'Toggle flag',
                              icon: <Flag className="h-3.5 w-3.5" />,
                              onSelect: () =>
                                void messageActions.mutateAsync({
                                  type: 'update',
                                  messageId: row.id,
                                  payload: { flagged: !row.flagged },
                                }),
                            },
                            {
                              id: 'delete',
                              label: 'Delete',
                              icon: <Trash2 className="h-3.5 w-3.5" />,
                              onSelect: () => void messageActions.mutateAsync({ type: 'delete', messageId: row.id }),
                            },
                          ]
                        : []),
                    ]}
                  />
                )}
              </QueryState>

              <div className="rounded-xl border border-dashed border-border bg-muted/30 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Waveform</p>
                <div className="mt-2 flex h-12 items-end gap-0.5">
                  {Array.from({ length: 48 }).map((_, i) => (
                    <div key={i} className="w-1 rounded-sm bg-primary/30" style={{ height: `${20 + (i % 7) * 8}%` }} />
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Select a message and press Play to open audio playback.</p>
              </div>
            </div>
          ) : null}

          <SlideOver open={createOpen} onClose={() => setCreateOpen(false)} title="Add Voicemail Mailbox">
            {mailboxFormFields}
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button onClick={() => void handleCreate()} disabled={create.isPending}>Create</Button>
            </div>
          </SlideOver>

          <SlideOver open={Boolean(editRow)} onClose={() => setEditRow(null)} title="Edit Mailbox">
            {mailboxFormFields}
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditRow(null)}>Cancel</Button>
              <Button onClick={() => void handleUpdate()} disabled={update.isPending}>Save</Button>
            </div>
          </SlideOver>
        </PageContainer>
      )}
    </ModuleAccessGate>
  );
}
