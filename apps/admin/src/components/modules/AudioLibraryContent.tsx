'use client';

import {
  AlertTriangle,
  History,
  Music,
  Pause,
  Play,
  Plus,
  Trash2,
  Upload,
  Volume2,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { usePermissions } from '../../lib/auth/AuthProvider';
import {
  useAnnouncementPreview,
  useAnnouncementVersions,
  useAudioReports,
  useCreateMohPlaylist,
  useCreateMohTrack,
  useDeleteMohPlaylist,
  useDeleteMohTrack,
  useMohAssignments,
  useMohPlaylists,
  useMohPlaylistVersions,
  useMohTrackPreview,
  usePresignAudioUpload,
  useReplaceAnnouncement,
} from '../../lib/hooks/queries/use-audio-library';
import {
  useAnnouncements,
  useCreateAnnouncement,
  useDeleteAnnouncement,
} from '../../lib/hooks/queries/use-ivr-routing-mutations';
import { PERMISSIONS, hasPermission } from '../../lib/rbac/permissions';
import { cn } from '../../lib/utils/cn';
import type { Column } from '../data/DataTable';
import { DataTable } from '../data/DataTable';
import { EmptyState } from '../data/EmptyState';
import { MetricCard } from '../data/MetricCard';
import { QueryState } from '../feedback/QueryState';
import { PageContainer, PageHeader } from '../layout/PageHeader';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { SlideOver } from '../ui/SlideOver';
import { ModuleAccessGate } from './shared/ModuleShell';

type TabId = 'announcements' | 'moh';

const ANNOUNCEMENT_CATEGORIES = ['GREETING', 'MUSIC', 'ANNOUNCEMENT', 'PROMPT', 'TTS'] as const;
const MOH_PLAY_MODES = ['SEQUENTIAL', 'SHUFFLE', 'RANDOM', 'PRIORITY'] as const;
const MOH_SCOPES = ['GLOBAL', 'TENANT', 'QUEUE', 'RING_GROUP', 'IVR', 'CONFERENCE'] as const;
const LANGUAGES = ['en', 'es', 'fr', 'de', 'pt', 'ja', 'zh'];

type Row = Record<string, unknown> & { id: string };

async function uploadToPresignedUrl(file: File, presign: Record<string, unknown>) {
  const uploadUrl = presign.uploadUrl as string | null | undefined;
  const objectKey = presign.objectKey as string;
  if (!uploadUrl) throw new Error('Upload URL unavailable');
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type || 'audio/wav' },
  });
  if (!res.ok) throw new Error(`Upload failed (${res.status})`);
  return objectKey;
}

export function AudioLibraryContent({
  defaultTab = 'announcements',
  moduleId = 'audio-library',
  hideTabs = false,
}: {
  defaultTab?: TabId;
  moduleId?: string;
  hideTabs?: boolean;
}) {
  const permissions = usePermissions();
  const canWrite = hasPermission(permissions, PERMISSIONS.TENANT_IVR_WRITE);
  const audioRef = useRef<HTMLAudioElement>(null);

  const [tab, setTab] = useState<TabId>(defaultTab);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [languageFilter, setLanguageFilter] = useState('');
  const [search, setSearch] = useState('');
  const [selectedMohId, setSelectedMohId] = useState<string | null>(null);
  const [selectedAnnId, setSelectedAnnId] = useState<string | null>(null);
  const [createAnnOpen, setCreateAnnOpen] = useState(false);
  const [createMohOpen, setCreateMohOpen] = useState(false);
  const [addTrackOpen, setAddTrackOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);

  const [annForm, setAnnForm] = useState({
    name: '',
    category: 'ANNOUNCEMENT',
    language: 'en',
    description: '',
    isEmergency: false,
    ttsText: '',
  });
  const [mohForm, setMohForm] = useState({
    name: '',
    playMode: 'SEQUENTIAL',
    scope: 'TENANT',
    language: 'en',
    isDefault: false,
    streamingUrl: '',
    priority: '100',
  });
  const [trackForm, setTrackForm] = useState({ name: '', file: null as File | null });

  const reportsQuery = useAudioReports();
  const assignmentsQuery = useMohAssignments();
  const announcementsQuery = useAnnouncements(categoryFilter || undefined);
  const mohQuery = useMohPlaylists(undefined, languageFilter || undefined);
  const mohVersionsQuery = useMohPlaylistVersions(selectedMohId ?? undefined);
  const annVersionsQuery = useAnnouncementVersions(selectedAnnId ?? undefined);

  const createAnn = useCreateAnnouncement();
  const deleteAnn = useDeleteAnnouncement();
  const replaceAnn = useReplaceAnnouncement();
  const createMoh = useCreateMohPlaylist();
  const deleteMoh = useDeleteMohPlaylist();
  const createTrack = useCreateMohTrack();
  const deleteTrack = useDeleteMohTrack();
  const presign = usePresignAudioUpload();
  const previewAnn = useAnnouncementPreview();
  const previewTrack = useMohTrackPreview();

  const announcements = useMemo(() => {
    const rows = (announcementsQuery.data ?? []) as Row[];
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter((r) => String(r.name ?? '').toLowerCase().includes(q));
  }, [announcementsQuery.data, search]);

  const playlists = useMemo(() => {
    const rows = (mohQuery.data ?? []) as Row[];
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter((r) => String(r.name ?? '').toLowerCase().includes(q));
  }, [mohQuery.data, search]);

  const selectedPlaylist = useMemo(
    () => playlists.find((p) => p.id === selectedMohId),
    [playlists, selectedMohId],
  );

  const tracks = (selectedPlaylist?.tracks as Row[] | undefined) ?? [];

  const playUrl = async (type: 'ann' | 'track', id: string) => {
    try {
      const res =
        type === 'ann'
          ? await previewAnn.mutateAsync(id)
          : await previewTrack.mutateAsync(id);
      if (!res.url) {
        setError('No preview available');
        return;
      }
      setPlayingUrl(res.url);
      if (audioRef.current) {
        audioRef.current.src = res.url;
        void audioRef.current.play();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Preview failed');
    }
  };

  const handleCreateAnnouncement = async () => {
    setError(null);
    try {
      await createAnn.mutateAsync({
        name: annForm.name,
        category: annForm.category,
        language: annForm.language,
        description: annForm.description || undefined,
        isEmergency: annForm.isEmergency,
        ttsText: annForm.ttsText || undefined,
      });
      setCreateAnnOpen(false);
      setAnnForm({ name: '', category: 'ANNOUNCEMENT', language: 'en', description: '', isEmergency: false, ttsText: '' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed');
    }
  };

  const handleUploadAnnouncement = async (id: string, file: File) => {
    setError(null);
    try {
      const presigned = await presign.mutateAsync({ filename: file.name, contentType: file.type });
      const objectKey = await uploadToPresignedUrl(file, presigned);
      await replaceAnn.mutateAsync({ id, payload: { mediaObjectKey: objectKey, changeNotes: 'Uploaded replacement' } });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    }
  };

  const handleCreateMoh = async () => {
    setError(null);
    try {
      const created = await createMoh.mutateAsync({
        name: mohForm.name,
        playMode: mohForm.playMode,
        scope: mohForm.scope,
        language: mohForm.language,
        isDefault: mohForm.isDefault,
        streamingUrl: mohForm.streamingUrl || undefined,
        priority: Number(mohForm.priority) || 100,
      });
      setCreateMohOpen(false);
      setSelectedMohId(String(created.id));
      setMohForm({ name: '', playMode: 'SEQUENTIAL', scope: 'TENANT', language: 'en', isDefault: false, streamingUrl: '', priority: '100' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed');
    }
  };

  const handleAddTrack = async () => {
    if (!selectedMohId || !trackForm.file) return;
    setError(null);
    try {
      const presigned = await presign.mutateAsync({ filename: trackForm.file.name, contentType: trackForm.file.type });
      const objectKey = await uploadToPresignedUrl(trackForm.file, presigned);
      await createTrack.mutateAsync({
        playlistId: selectedMohId,
        name: trackForm.name || trackForm.file.name,
        mediaObjectKey: objectKey,
      });
      setAddTrackOpen(false);
      setTrackForm({ name: '', file: null });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Track upload failed');
    }
  };

  const annColumns: Column<Row>[] = [
    { key: 'name', header: 'Name', cell: (r) => String(r.name ?? '—') },
    {
      key: 'category',
      header: 'Category',
      cell: (r) => <Badge variant="default">{String(r.category ?? '—')}</Badge>,
    },
    { key: 'language', header: 'Language', cell: (r) => String(r.language ?? 'en') },
    {
      key: 'emergency',
      header: 'Emergency',
      cell: (r) =>
        r.isEmergency ? (
          <span className="inline-flex items-center gap-1 text-destructive">
            <AlertTriangle className="h-3.5 w-3.5" /> Yes
          </span>
        ) : (
          '—'
        ),
    },
    { key: 'version', header: 'Ver.', cell: (r) => String(r.version ?? 1) },
    {
      key: 'actions',
      header: '',
      cell: (r) => (
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => void playUrl('ann', r.id)}>
            <Play className="h-4 w-4" />
          </Button>
          {canWrite ? (
            <>
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleUploadAnnouncement(r.id, f);
                  }}
                />
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted">
                  <Upload className="h-4 w-4" />
                </span>
              </label>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setSelectedAnnId(r.id);
                }}
              >
                <History className="h-4 w-4" />
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void deleteAnn.mutateAsync(r.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </>
          ) : null}
        </div>
      ),
    },
  ];

  const mohColumns: Column<Row>[] = [
    { key: 'name', header: 'Playlist', cell: (r) => String(r.name ?? '—') },
    { key: 'scope', header: 'Scope', cell: (r) => String(r.scope ?? 'TENANT') },
    { key: 'playMode', header: 'Mode', cell: (r) => String(r.playMode ?? 'SEQUENTIAL') },
    { key: 'language', header: 'Lang', cell: (r) => String(r.language ?? 'en') },
    {
      key: 'default',
      header: 'Default',
      cell: (r) => (r.isDefault ? <Badge variant="success">Default</Badge> : '—'),
    },
    {
      key: 'tracks',
      header: 'Tracks',
      cell: (r) => String((r.tracks as unknown[] | undefined)?.length ?? 0),
    },
    {
      key: 'actions',
      header: '',
      cell: (r) => (
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => setSelectedMohId(r.id)}>
            Manage
          </Button>
          {canWrite ? (
            <Button size="sm" variant="ghost" onClick={() => void deleteMoh.mutateAsync(r.id)}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  const reports = reportsQuery.data ?? {};

  return (
    <ModuleAccessGate moduleId={moduleId}>
      {() => (
      <PageContainer>
        <audio ref={audioRef} className="hidden" onEnded={() => setPlayingUrl(null)} />
        <PageHeader
          title={tab === 'announcements' ? 'Announcements' : 'Music on Hold'}
          description="Enterprise music on hold, announcements, prompts, and per-language playlists."
          actions={
            canWrite ? (
              <Button
                onClick={() => (tab === 'announcements' ? setCreateAnnOpen(true) : setCreateMohOpen(true))}
              >
                <Plus className="h-4 w-4" />
                {tab === 'announcements' ? 'New announcement' : 'New MOH playlist'}
              </Button>
            ) : null
          }
        />

        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Announcements" value={String(reports.announcementCount ?? '—')} icon={Volume2} />
          <MetricCard label="MOH Playlists" value={String(reports.mohPlaylistCount ?? '—')} icon={Music} />
          <MetricCard label="MOH Tracks" value={String(reports.mohTrackCount ?? '—')} icon={Music} />
          <MetricCard label="Emergency" value={String(reports.emergencyCount ?? '—')} icon={AlertTriangle} />
        </div>

        {!hideTabs ? (
        <div className="mb-4 flex flex-wrap gap-2">
          {(['announcements', 'moh'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                tab === t ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80',
              )}
            >
              {t === 'announcements' ? 'Announcements' : 'Music on Hold'}
            </button>
          ))}
        </div>
        ) : null}

        <div className="mb-4 flex flex-wrap gap-3">
          <Input
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
          {tab === 'announcements' ? (
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="">All categories</option>
              {ANNOUNCEMENT_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          ) : (
            <select
              value={languageFilter}
              onChange={(e) => setLanguageFilter(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="">All languages</option>
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          )}
        </div>

        {error ? (
          <p className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {playingUrl ? (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-4 py-2 text-sm">
            <Pause className="h-4 w-4" />
            Preview playing…
            <Button size="sm" variant="ghost" onClick={() => { audioRef.current?.pause(); setPlayingUrl(null); }}>
              Stop
            </Button>
          </div>
        ) : null}

        {tab === 'announcements' ? (
          <QueryState
            isLoading={announcementsQuery.isLoading}
            isError={announcementsQuery.isError}
            error={announcementsQuery.error}
            isEmpty={!announcements.length}
            empty={<EmptyState title="No announcements" description="Upload prompts, greetings, and queue announcements." />}
          >
            <DataTable columns={annColumns} data={announcements} />
          </QueryState>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            <QueryState
              isLoading={mohQuery.isLoading}
              isError={mohQuery.isError}
              error={mohQuery.error}
              isEmpty={!playlists.length}
              empty={<EmptyState title="No MOH playlists" description="Create tenant, queue, or conference hold music." />}
            >
              <DataTable columns={mohColumns} data={playlists} />
            </QueryState>

            {selectedMohId && selectedPlaylist ? (
              <div className="rounded-xl border border-border p-4">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold">{String(selectedPlaylist.name)}</h3>
                    <p className="text-sm text-muted-foreground">
                      {String(selectedPlaylist.playMode)} · {String(selectedPlaylist.scope)} · v{String(selectedPlaylist.version)}
                    </p>
                  </div>
                  {canWrite ? (
                    <Button size="sm" onClick={() => setAddTrackOpen(true)}>
                      <Upload className="h-4 w-4" /> Add track
                    </Button>
                  ) : null}
                </div>
                {selectedPlaylist.streamingUrl ? (
                  <p className="mb-3 text-sm text-muted-foreground">
                    Streaming: {String(selectedPlaylist.streamingUrl)}
                  </p>
                ) : null}
                <ul className="space-y-2">
                  {tracks.map((t) => (
                    <li key={t.id} className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-sm">
                      <span>{String(t.name)}</span>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => void playUrl('track', t.id)}>
                          <Play className="h-4 w-4" />
                        </Button>
                        {canWrite ? (
                          <Button size="sm" variant="ghost" onClick={() => void deleteTrack.mutateAsync(t.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
                {mohVersionsQuery.data?.length ? (
                  <div className="mt-4 border-t border-border pt-4">
                    <h4 className="mb-2 text-sm font-medium">Version history</h4>
                    <ul className="max-h-32 space-y-1 overflow-y-auto text-xs text-muted-foreground">
                      {(mohVersionsQuery.data as Row[]).map((v) => (
                        <li key={String(v.id)}>
                          v{String(v.version)} — {String(v.changeNotes ?? 'Updated')} · {String(v.createdAt ?? '').slice(0, 10)}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        )}

        {assignmentsQuery.data ? (
          <div className="mt-8 rounded-xl border border-border p-4">
            <h3 className="mb-3 font-semibold">MOH assignments</h3>
            <div className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
              {(['queues', 'ringGroups', 'ivrs', 'conferences'] as const).map((key) => {
                const items = (assignmentsQuery.data[key] as Row[] | undefined) ?? [];
                return (
                  <div key={key}>
                    <p className="mb-1 font-medium capitalize">{key.replace(/([A-Z])/g, ' $1')}</p>
                    {items.length ? (
                      <ul className="space-y-1 text-muted-foreground">
                        {items.slice(0, 5).map((i) => (
                          <li key={i.id}>{String(i.name ?? i.code ?? i.extension)}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-muted-foreground">None</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        <SlideOver open={createAnnOpen} onClose={() => setCreateAnnOpen(false)} title="New announcement">
          <div className="space-y-4">
            <Input placeholder="Name" value={annForm.name} onChange={(e) => setAnnForm({ ...annForm, name: e.target.value })} />
            <select
              value={annForm.category}
              onChange={(e) => setAnnForm({ ...annForm, category: e.target.value })}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm"
            >
              {ANNOUNCEMENT_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select
              value={annForm.language}
              onChange={(e) => setAnnForm({ ...annForm, language: e.target.value })}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm"
            >
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
            <Input
              placeholder="Description (optional)"
              value={annForm.description}
              onChange={(e) => setAnnForm({ ...annForm, description: e.target.value })}
            />
            <Input
              placeholder="TTS text (optional)"
              value={annForm.ttsText}
              onChange={(e) => setAnnForm({ ...annForm, ttsText: e.target.value })}
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={annForm.isEmergency}
                onChange={(e) => setAnnForm({ ...annForm, isEmergency: e.target.checked })}
              />
              Emergency announcement
            </label>
            <Button className="w-full" onClick={() => void handleCreateAnnouncement()} disabled={!annForm.name.trim()}>
              Create
            </Button>
          </div>
        </SlideOver>

        <SlideOver open={createMohOpen} onClose={() => setCreateMohOpen(false)} title="New MOH playlist">
          <div className="space-y-4">
            <Input placeholder="Name" value={mohForm.name} onChange={(e) => setMohForm({ ...mohForm, name: e.target.value })} />
            <select
              value={mohForm.scope}
              onChange={(e) => setMohForm({ ...mohForm, scope: e.target.value })}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm"
            >
              {MOH_SCOPES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <select
              value={mohForm.playMode}
              onChange={(e) => setMohForm({ ...mohForm, playMode: e.target.value })}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm"
            >
              {MOH_PLAY_MODES.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <Input
              placeholder="Streaming URL (optional)"
              value={mohForm.streamingUrl}
              onChange={(e) => setMohForm({ ...mohForm, streamingUrl: e.target.value })}
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={mohForm.isDefault}
                onChange={(e) => setMohForm({ ...mohForm, isDefault: e.target.checked })}
              />
              Tenant default MOH
            </label>
            <Button className="w-full" onClick={() => void handleCreateMoh()} disabled={!mohForm.name.trim()}>
              Create playlist
            </Button>
          </div>
        </SlideOver>

        <SlideOver open={addTrackOpen} onClose={() => setAddTrackOpen(false)} title="Add MOH track">
          <div className="space-y-4">
            <Input
              placeholder="Track name"
              value={trackForm.name}
              onChange={(e) => setTrackForm({ ...trackForm, name: e.target.value })}
            />
            <Input
              type="file"
              accept="audio/*"
              onChange={(e) => setTrackForm({ ...trackForm, file: e.target.files?.[0] ?? null })}
            />
            <Button className="w-full" onClick={() => void handleAddTrack()} disabled={!trackForm.file}>
              Upload track
            </Button>
          </div>
        </SlideOver>

        {selectedAnnId && annVersionsQuery.data?.length ? (
          <SlideOver open={Boolean(selectedAnnId)} onClose={() => setSelectedAnnId(null)} title="Announcement versions">
            <ul className="space-y-2 text-sm">
              {(annVersionsQuery.data as Row[]).map((v) => (
                <li key={String(v.id)} className="rounded-lg border border-border px-3 py-2">
                  v{String(v.version)} — {String(v.name)} · {String(v.createdAt ?? '').slice(0, 10)}
                </li>
              ))}
            </ul>
          </SlideOver>
        ) : null}
      </PageContainer>
      )}
    </ModuleAccessGate>
  );
}
