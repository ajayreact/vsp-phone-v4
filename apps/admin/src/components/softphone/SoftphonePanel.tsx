'use client';

import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ChevronDown,
  Grid3X3,
  Headphones,
  LogIn,
  LogOut,
  Mic,
  MicOff,
  Minimize2,
  Moon,
  Pause,
  Phone,
  PhoneCall,
  PhoneForwarded,
  PhoneIncoming,
  PhoneOff,
  Play,
  Star,
  Sun,
  User,
  Users,
  Video,
  Voicemail,
  Volume2,
  Wifi,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  clearToken,
  enroll,
  login,
  revokeEnroll,
  storeToken,
  updatePresence,
} from '../../lib/api-client';
import { getAccessToken } from '../../lib/auth/session';
import { useAuth } from '../../lib/auth/AuthProvider';
import { useTenantCdr, useTenantQueues } from '../../lib/hooks/queries/use-tenant';
import { useVoicemailMailboxes, useVoicemailMessages } from '../../lib/hooks/queries/use-vcr-communications';
import { receptionRepository } from '../../lib/repositories/reception.repository';
import { queueRingRepository } from '../../lib/repositories/queue-ring.repository';
import { queryKeys } from '../../lib/query/query-keys';
import { SipSoftphoneClient } from '../../lib/softphone/sip-softphone';
import type { CallSessionInfo, NetworkQuality, SoftphoneLayout, SoftphoneState } from '../../lib/softphone/types';
import { cn } from '../../lib/utils/cn';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

const DIAL_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'] as const;
type TabId = 'recent' | 'favorites' | 'voicemail' | 'contacts' | 'queues';

const PRESENCE_MAP = {
  Available: 'OPEN',
  Busy: 'BUSY',
  Away: 'AWAY',
  DND: 'CLOSED',
} as const;

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function notifyIncoming(from: string) {
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    new Notification('Incoming call', { body: from });
  }
}

export function SoftphonePanel() {
  const { session } = useAuth();
  const clientRef = useRef<SipSoftphoneClient | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [dialTarget, setDialTarget] = useState('');
  const [state, setState] = useState<SoftphoneState>('idle');
  const [detail, setDetail] = useState('');
  const [incomingFrom, setIncomingFrom] = useState<string | null>(null);
  const [waitingCall, setWaitingCall] = useState<{ from: string; sessionId: string } | null>(null);
  const [sessions, setSessions] = useState<CallSessionInfo[]>([]);
  const [muted, setMuted] = useState(false);
  const [held, setHeld] = useState(false);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [aor, setAor] = useState<string | null>(null);
  const [presence, setPresence] = useState<keyof typeof PRESENCE_MAP>('Available');
  const [tab, setTab] = useState<TabId>('recent');
  const [callDuration, setCallDuration] = useState(0);
  const [showKeypad, setShowKeypad] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferTarget, setTransferTarget] = useState('');
  const [warmTransfer, setWarmTransfer] = useState(false);
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([]);
  const [speakerDevices, setSpeakerDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedMic, setSelectedMic] = useState('');
  const [selectedSpeaker, setSelectedSpeaker] = useState('');
  const [darkMode, setDarkMode] = useState(false);
  const [layout, setLayout] = useState<SoftphoneLayout>('full');
  const [networkStats, setNetworkStats] = useState<NetworkQuality | null>(null);
  const [selectedVoicemailId, setSelectedVoicemailId] = useState<string | null>(null);
  const [pushToTalk, setPushToTalk] = useState(false);

  const extension = useMemo(() => {
    if (!aor) return '';
    const m = aor.match(/sip:([^@]+)/);
    return m?.[1] ?? '';
  }, [aor]);

  const inCall = state === 'in-call' || state === 'calling' || state === 'ringing' || state === 'held';
  const registered = state === 'registered' || inCall;

  const cdrQuery = useTenantCdr({ limit: 25 });
  const favoritesQuery = useQuery({
    queryKey: queryKeys.tenant.contactFavorites(),
    queryFn: () => receptionRepository.listFavorites(),
    enabled: Boolean(token),
  });
  const contactsQuery = useQuery({
    queryKey: queryKeys.tenant.contacts({ search: '' }),
    queryFn: () => receptionRepository.listContacts(),
    enabled: Boolean(token),
  });
  const queuesQuery = useTenantQueues();
  const voicemailBoxesQuery = useVoicemailMailboxes();
  const voicemailMessagesQuery = useVoicemailMessages(selectedVoicemailId ?? undefined, { limit: 30 });

  useEffect(() => {
    setToken(getAccessToken());
  }, [session]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      void Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    if (state !== 'in-call') {
      setCallDuration(0);
      return;
    }
    const t = setInterval(() => setCallDuration((d) => d + 1), 1000);
    return () => clearInterval(t);
  }, [state]);

  useEffect(() => {
    const client = new SipSoftphoneClient();
    clientRef.current = client;
    const off = client.on((ev) => {
      if (ev.type === 'state') {
        setState(ev.state);
        setDetail(ev.detail ?? '');
      } else if (ev.type === 'incoming') {
        setIncomingFrom(ev.from);
        notifyIncoming(ev.from);
      } else if (ev.type === 'waiting') {
        setWaitingCall({ from: ev.from, sessionId: ev.sessionId });
        notifyIncoming(`Call waiting: ${ev.from}`);
      } else if (ev.type === 'stats') {
        setNetworkStats(ev.stats);
      } else if (ev.type === 'sessions') {
        setSessions(ev.sessions);
        const active = ev.sessions.find((s) => s.id === client.getActiveSessionId());
        setMuted(active?.muted ?? false);
        setHeld(active?.held ?? false);
      }
    });
    return () => {
      off();
      void client.disconnect();
    };
  }, []);

  const loadDevices = useCallback(async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const { inputs, outputs } = await clientRef.current!.listAudioDevices();
      setMicDevices(inputs);
      setSpeakerDevices(outputs);
      if (inputs[0]) setSelectedMic(inputs[0].deviceId);
      if (outputs[0]) setSelectedSpeaker(outputs[0].deviceId);
    } catch {
      /* optional */
    }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'Enter' && registered && dialTarget.trim()) void clientRef.current?.call(dialTarget.trim());
      if (e.key === 'Escape' && inCall) void clientRef.current?.hangup();
      if (e.key === 'm' || e.key === 'M') void clientRef.current?.toggleMute().then(setMuted);
      if (e.key === 'h' || e.key === 'H') void clientRef.current?.toggleHold().then(setHeld);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [registered, dialTarget, inCall]);

  const handleLogin = async () => {
    const res = await login(email, password);
    storeToken(res.accessToken);
    setToken(res.accessToken);
  };

  const handleRegister = async () => {
    if (!token) return;
    const e = await enroll(token);
    setDeviceId(e.deviceId);
    setAor(e.aor);
    await clientRef.current!.connect({
      sipUsername: e.sipUsername,
      sipPassword: e.sipPassword,
      aor: e.aor,
      wssUrl: e.wssUrl,
      iceServers: e.iceServers,
      expiresAt: e.expiresAt,
      onReEnroll: async () => {
        const fresh = await enroll(token, e.deviceId);
        return {
          sipPassword: fresh.sipPassword,
          expiresAt: fresh.expiresAt,
          wssUrl: fresh.wssUrl,
          iceServers: fresh.iceServers,
        };
      },
    });
    await updatePresence(token, e.aor, 'OPEN');
    await loadDevices();
  };

  const handleLogout = async () => {
    if (token && deviceId) {
      try {
        await revokeEnroll(token, deviceId);
      } catch {
        /* ignore */
      }
    }
    await clientRef.current?.disconnect();
    clearToken();
    setToken(null);
    setDeviceId(null);
    setAor(null);
  };

  const handlePresenceChange = async (p: keyof typeof PRESENCE_MAP) => {
    setPresence(p);
    if (token && aor) {
      await updatePresence(token, aor, PRESENCE_MAP[p]);
      await receptionRepository.setPresence({ status: p });
    }
  };

  const appendDigit = (d: string) => {
    setDialTarget((v) => v + d);
    if (inCall) void clientRef.current?.sendDtmf(d);
  };

  const handleCall = async (target?: string) => {
    const dest = (target ?? dialTarget).trim();
    if (!dest) return;
    setDialTarget(dest);
    await clientRef.current?.call(dest);
  };

  const handleTransfer = async () => {
    if (!transferTarget.trim()) return;
    if (warmTransfer) {
      await clientRef.current?.toggleHold();
      setHeld(true);
      await clientRef.current?.call(transferTarget.trim());
      setShowTransfer(false);
    } else {
      await clientRef.current?.blindTransfer(transferTarget.trim());
      setShowTransfer(false);
      setTransferTarget('');
    }
  };

  const myQueueMemberships = useMemo(() => {
    const queues = (queuesQuery.data ?? []) as Record<string, unknown>[];
    const result: { queueId: string; queueName: string; memberId: string; loggedIn?: boolean }[] = [];
    for (const q of queues) {
      const members = (q.members as Record<string, unknown>[] | undefined) ?? [];
      for (const m of members) {
        const ext = (m.extension as { extension?: string } | undefined)?.extension;
        const lineExt = (m.line as { extension?: { extension?: string } } | undefined)?.extension?.extension;
        if (ext === extension || lineExt === extension) {
          result.push({
            queueId: String(q.id),
            queueName: String(q.name),
            memberId: String(m.id),
            loggedIn: Boolean(m.loggedIn),
          });
        }
      }
    }
    return result;
  }, [queuesQuery.data, extension]);

  useEffect(() => {
    const boxes = (voicemailBoxesQuery.data ?? []) as Record<string, unknown>[];
    if (!selectedVoicemailId && boxes[0]?.id) setSelectedVoicemailId(String(boxes[0].id));
  }, [voicemailBoxesQuery.data, selectedVoicemailId]);

  const shellClass = cn(
    'gradient-mesh relative min-h-screen overflow-hidden transition-all',
    layout === 'mini' && 'min-h-0 max-w-md mx-auto rounded-3xl shadow-2xl my-4',
    layout === 'dock' && 'min-h-0 fixed bottom-0 left-0 right-0 h-[420px] rounded-t-3xl border-t border-border shadow-2xl z-50',
    layout === 'floating' && 'min-h-0 fixed bottom-6 right-6 w-[380px] h-[640px] rounded-3xl border border-border shadow-2xl z-50',
  );

  if (!token && !session) {
    return (
      <div className="gradient-mesh flex min-h-screen items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel w-full max-w-md rounded-3xl border border-border p-8 shadow-[var(--shadow-elevated)]"
        >
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Phone className="h-8 w-8" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">VSP Enterprise Softphone</h1>
            <p className="mt-2 text-sm text-muted-foreground">Sign in to register your WebRTC endpoint</p>
          </div>
          <div className="space-y-4">
            <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Email" />
            <Input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Password" />
            <Button className="w-full" onClick={() => void handleLogin()}>
              Sign in
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className={shellClass}>
      <audio data-softphone-remote autoPlay playsInline />

      <AnimatePresence>
        {incomingFrom && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-6 backdrop-blur-md">
            <motion.div initial={{ scale: 0.92 }} animate={{ scale: 1 }} className="glass-panel w-full max-w-sm rounded-3xl border p-8 text-center shadow-2xl">
              <PhoneIncoming className="mx-auto mb-4 h-10 w-10 animate-pulse text-primary" />
              <p className="text-sm text-muted-foreground">Incoming call</p>
              <p className="mt-1 text-2xl font-semibold">{incomingFrom}</p>
              <div className="mt-8 flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => { void clientRef.current?.reject(); setIncomingFrom(null); }}>Decline</Button>
                <Button className="flex-1" onClick={() => { void clientRef.current?.answer(); setIncomingFrom(null); }}>Answer</Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {waitingCall ? (
        <div className="fixed top-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-card/95 px-4 py-2 shadow-lg backdrop-blur">
          <PhoneIncoming className="h-4 w-4 text-primary" />
          <span className="text-sm">Call waiting: {waitingCall.from}</span>
          <Button size="sm" onClick={() => void clientRef.current?.switchToSession(waitingCall.sessionId).then(() => void clientRef.current?.answer(waitingCall.sessionId))}>Answer</Button>
        </div>
      ) : null}

      <div className={cn('mx-auto flex flex-col', layout === 'full' ? 'min-h-screen max-w-7xl lg:flex-row' : 'h-full')}>
        <div className="flex flex-1 flex-col p-4 sm:p-6">
          <header className="glass-panel mb-4 flex flex-wrap items-center gap-3 rounded-2xl border p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <User className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{extension || session?.email}</p>
              <p className="text-xs text-muted-foreground">{registered ? 'Registered' : 'Offline'} · {sessions.length} active</p>
            </div>
            <select value={presence} onChange={(e) => void handlePresenceChange(e.target.value as keyof typeof PRESENCE_MAP)} className="rounded-xl border bg-background/80 px-3 py-2 text-sm">
              {Object.keys(PRESENCE_MAP).map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <Button size="sm" variant="ghost" onClick={() => setDarkMode((d) => !d)} aria-label="Toggle dark mode">
              {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setLayout((l) => (l === 'full' ? 'floating' : l === 'floating' ? 'mini' : l === 'mini' ? 'dock' : 'full'))}>
              <Minimize2 className="h-4 w-4" />
            </Button>
            {!registered ? (
              <Button size="sm" onClick={() => void handleRegister()}>Register</Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => void handleLogout()}>Logout</Button>
            )}
          </header>

          {networkStats ? (
            <div className="glass-panel mb-4 grid grid-cols-4 gap-2 rounded-xl border p-3 text-center text-xs">
              <div><Wifi className="mx-auto h-3.5 w-3.5" /><p className="font-medium">{networkStats.mos}</p><p className="text-muted-foreground">MOS</p></div>
              <div><p className="font-medium">{networkStats.jitterMs}ms</p><p className="text-muted-foreground">Jitter</p></div>
              <div><p className="font-medium">{networkStats.packetLossPct}%</p><p className="text-muted-foreground">Loss</p></div>
              <div><p className="font-medium">{networkStats.rttMs}ms</p><p className="text-muted-foreground">RTT</p></div>
            </div>
          ) : null}

          <div className="glass-panel mb-4 rounded-2xl border p-3">
            <Input value={dialTarget} onChange={(e) => setDialTarget(e.target.value)} placeholder="Dial extension or E.164" className="border-0 bg-transparent text-center text-xl font-medium shadow-none focus-visible:ring-0" />
          </div>

          {(showKeypad || !inCall) && (
            <div className="mx-auto grid w-full max-w-xs grid-cols-3 gap-2">
              {DIAL_KEYS.map((key) => (
                <motion.button key={key} type="button" whileTap={{ scale: 0.95 }} onClick={() => appendDigit(key)} className="glass-panel flex h-14 items-center justify-center rounded-xl border text-xl font-medium">
                  {key}
                </motion.button>
              ))}
            </div>
          )}

          <div className="mx-auto mt-4 flex w-full max-w-xs gap-2">
            <Button className="h-12 flex-1 rounded-xl" onClick={() => void handleCall()} disabled={!registered || !dialTarget.trim()}>
              <PhoneCall className="h-4 w-4" /> Call
            </Button>
            {inCall ? (
              <Button variant="destructive" className="h-12 rounded-xl px-4" onClick={() => void clientRef.current?.hangup()}>
                <PhoneOff className="h-4 w-4" />
              </Button>
            ) : null}
          </div>

          <div className="mt-6 flex-1">
            <div className="mb-3 flex gap-1 overflow-x-auto">
              {([
                ['recent', 'Recent', Phone],
                ['favorites', 'Favorites', Star],
                ['contacts', 'Contacts', Users],
                ['voicemail', 'Voicemail', Voicemail],
                ['queues', 'Queues', Headphones],
              ] as const).map(([id, label, Icon]) => (
                <button key={id} type="button" onClick={() => setTab(id)} className={cn('flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium', tab === id ? 'bg-primary text-primary-foreground' : 'bg-muted/60 text-muted-foreground')}>
                  <Icon className="h-3.5 w-3.5" />{label}
                </button>
              ))}
            </div>
            <div className="glass-panel max-h-64 overflow-y-auto rounded-xl border p-3 text-sm">
              {tab === 'recent' && (
                <ul className="space-y-2">
                  {((cdrQuery.data ?? []) as Record<string, unknown>[]).map((c) => (
                    <li key={String(c.id)}>
                      <button type="button" className="flex w-full justify-between rounded-lg px-2 py-1.5 hover:bg-muted/60" onClick={() => void handleCall(String(c.toNumber ?? c.fromNumber ?? ''))}>
                        <span>{String(c.direction ?? '')} {String(c.toNumber ?? c.fromNumber ?? '—')}</span>
                        <span className="text-muted-foreground">{String(c.durationSec ?? 0)}s</span>
                      </button>
                    </li>
                  ))}
                  {!cdrQuery.data?.length ? <p className="text-muted-foreground">No recent calls</p> : null}
                </ul>
              )}
              {tab === 'favorites' && (
                <ul className="space-y-2">
                  {((favoritesQuery.data ?? []) as Record<string, unknown>[]).map((c) => (
                    <li key={String(c.id ?? c.contactId)}>
                      <button type="button" className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-muted/60" onClick={() => void handleCall(String(c.number ?? c.extension ?? ''))}>
                        <Star className="mr-1 inline h-3 w-3 text-amber-500" />{String(c.displayName ?? c.name ?? c.number)}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {tab === 'contacts' && (
                <ul className="space-y-2">
                  {((contactsQuery.data ?? []) as Record<string, unknown>[]).map((c) => (
                    <li key={String(c.id)}>
                      <button type="button" className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-muted/60" onClick={() => void handleCall(String(c.primaryNumber ?? c.extension ?? ''))}>
                        {String(c.displayName ?? c.name)} · {String(c.primaryNumber ?? '—')}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {tab === 'voicemail' && (
                <div>
                  <select value={selectedVoicemailId ?? ''} onChange={(e) => setSelectedVoicemailId(e.target.value)} className="mb-2 w-full rounded-lg border px-2 py-1 text-xs">
                    {((voicemailBoxesQuery.data ?? []) as Record<string, unknown>[]).map((b) => (
                      <option key={String(b.id)} value={String(b.id)}>{String(b.name)}</option>
                    ))}
                  </select>
                  <ul className="space-y-2">
                    {((voicemailMessagesQuery.data ?? []) as Record<string, unknown>[]).map((m) => (
                      <li key={String(m.id)} className="rounded-lg bg-muted/40 px-2 py-1.5">
                        {String(m.callerId ?? 'Unknown')} · {String(m.durationSec ?? 0)}s
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {tab === 'queues' && (
                <ul className="space-y-2">
                  {myQueueMemberships.map((q) => (
                    <li key={q.memberId} className="flex items-center justify-between rounded-lg bg-muted/40 px-2 py-1.5">
                      <span>{q.queueName}</span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          void (q.loggedIn
                            ? queueRingRepository.agentLogout(q.queueId, q.memberId)
                            : queueRingRepository.agentLogin(q.queueId, q.memberId)).then(() => queuesQuery.refetch())
                        }
                      >
                        {q.loggedIn ? <><LogOut className="h-3 w-3" /> Out</> : <><LogIn className="h-3 w-3" /> In</>}
                      </Button>
                    </li>
                  ))}
                  {!myQueueMemberships.length ? <p className="text-muted-foreground">No queue memberships for ext {extension || '—'}</p> : null}
                </ul>
              )}
            </div>
          </div>
        </div>

        {layout === 'full' && (
          <aside className="glass-panel flex w-full flex-col border-t p-4 lg:w-80 lg:border-l lg:border-t-0">
            <h2 className="mb-4 font-semibold">Active Session</h2>
            {inCall ? (
              <>
                <p className="text-center text-lg font-medium">{dialTarget || incomingFrom || detail}</p>
                <p className="mb-4 text-center text-sm text-muted-foreground">{formatDuration(callDuration)}</p>
                <div className="mt-auto grid grid-cols-2 gap-2">
                  <Button variant="outline" size="sm" onClick={() => void clientRef.current?.toggleMute().then(setMuted)}>{muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />} Mute</Button>
                  <Button variant="outline" size="sm" onClick={() => void clientRef.current?.toggleHold().then(setHeld)}>{held ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />} Hold</Button>
                  <Button variant="outline" size="sm" onClick={() => setShowTransfer(true)}><PhoneForwarded className="h-4 w-4" /> Transfer</Button>
                  <Button variant="outline" size="sm" onClick={() => setShowKeypad((v) => !v)}><Grid3X3 className="h-4 w-4" /> DTMF</Button>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No active call</p>
            )}
            {micDevices.length > 0 ? (
              <div className="mt-4 space-y-2 border-t pt-4 text-xs">
                <label className="block">Microphone<select value={selectedMic} onChange={(e) => { setSelectedMic(e.target.value); void clientRef.current?.setMicrophone(e.target.value); }} className="mt-1 w-full rounded-lg border px-2 py-1">{micDevices.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || d.deviceId}</option>)}</select></label>
                <label className="block">Speaker<select value={selectedSpeaker} onChange={(e) => { setSelectedSpeaker(e.target.value); void clientRef.current?.setSpeaker(e.target.value); }} className="mt-1 w-full rounded-lg border px-2 py-1">{speakerDevices.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || d.deviceId}</option>)}</select></label>
                <label className="block">Camera (future)<select disabled className="mt-1 w-full rounded-lg border px-2 py-1 opacity-50"><option>Not configured</option></select></label>
              </div>
            ) : null}
          </aside>
        )}
      </div>

      <AnimatePresence>
        {inCall && (
          <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }} className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border bg-card/95 px-3 py-2 shadow-2xl backdrop-blur-xl">
            <ToolbarBtn active={muted} icon={muted ? MicOff : Mic} label="Mute" onClick={() => void clientRef.current?.toggleMute().then(setMuted)} />
            <ToolbarBtn active={held} icon={held ? Play : Pause} label="Hold" onClick={() => void clientRef.current?.toggleHold().then(setHeld)} />
            <ToolbarBtn icon={PhoneForwarded} label="Transfer" onClick={() => setShowTransfer(true)} />
            <ToolbarBtn active={showKeypad} icon={Grid3X3} label="DTMF" onClick={() => setShowKeypad((v) => !v)} />
            <ToolbarBtn active={pushToTalk} icon={Volume2} label="PTT" onClick={() => { setPushToTalk((p) => !p); if (!pushToTalk) void clientRef.current?.toggleMute().then(setMuted); }} />
            <ToolbarBtn icon={Video} label="Video" disabled />
            <button type="button" onClick={() => void clientRef.current?.hangup()} className="ml-1 flex h-11 w-11 items-center justify-center rounded-full bg-destructive text-white"><PhoneOff className="h-5 w-5" /></button>
          </motion.div>
        )}
      </AnimatePresence>

      {showTransfer ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-sm rounded-2xl border p-6">
            <h3 className="mb-4 font-semibold">Transfer call</h3>
            <Input value={transferTarget} onChange={(e) => setTransferTarget(e.target.value)} placeholder="Extension or number" className="mb-3" />
            <label className="mb-4 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={warmTransfer} onChange={(e) => setWarmTransfer(e.target.checked)} />
              Warm transfer (hold + consult)
            </label>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowTransfer(false)}>Cancel</Button>
              <Button className="flex-1" onClick={() => void handleTransfer()} disabled={!transferTarget.trim()}>Transfer</Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ToolbarBtn({ icon: Icon, label, onClick, active, disabled }: { icon: typeof Mic; label: string; onClick?: () => void; active?: boolean; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} title={label} className={cn('flex h-10 w-10 items-center justify-center rounded-full transition-colors', active ? 'bg-primary text-primary-foreground' : 'bg-muted/80 hover:bg-muted', disabled && 'opacity-40')}>
      <Icon className="h-4 w-4" />
    </button>
  );
}
