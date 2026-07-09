'use client';

import { AnimatePresence, motion } from 'framer-motion';
import {
  Grid3X3,
  Mic,
  MicOff,
  Pause,
  Phone,
  PhoneCall,
  PhoneForwarded,
  PhoneIncoming,
  PhoneOff,
  Play,
  Star,
  User,
  Video,
  Voicemail,
  Volume2,
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
import { SipSoftphoneClient } from '../../lib/softphone/sip-softphone';
import type { SoftphoneState } from '../../lib/softphone/types';
import { cn } from '../../lib/utils/cn';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

const DIAL_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'] as const;
type TabId = 'recent' | 'favorites' | 'voicemail' | 'contacts';

const PRESENCE_OPTIONS = ['Available', 'Busy', 'Away', 'DND'] as const;

function formatDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
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
  const [muted, setMuted] = useState(false);
  const [held, setHeld] = useState(false);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [aor, setAor] = useState<string | null>(null);
  const [presence, setPresence] = useState<(typeof PRESENCE_OPTIONS)[number]>('Available');
  const [tab, setTab] = useState<TabId>('recent');
  const [callDuration, setCallDuration] = useState(0);
  const [showKeypad, setShowKeypad] = useState(false);
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([]);
  const [speakerDevices, setSpeakerDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedMic, setSelectedMic] = useState('');
  const [selectedSpeaker, setSelectedSpeaker] = useState('');

  const inCall = state === 'in-call' || state === 'calling' || state === 'ringing';
  const registered = state === 'registered' || inCall;

  useEffect(() => {
    setToken(getAccessToken());
  }, [session]);

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
      /* device enumeration optional */
    }
  }, []);

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

  const appendDigit = (d: string) => setDialTarget((v) => v + d);

  const handleCall = async () => {
    if (!dialTarget.trim()) return;
    await clientRef.current?.call(dialTarget.trim());
  };

  const extensionLabel = useMemo(() => {
    if (aor) {
      const match = aor.match(/sip:([^@]+)/);
      return match?.[1] ?? session?.email ?? '—';
    }
    return session?.email ?? '—';
  }, [aor, session?.email]);

  const statusLabel = useMemo(() => {
    if (incomingFrom) return `Incoming from ${incomingFrom}`;
    if (detail) return detail;
    if (registered) return 'Registered';
    return 'Not registered';
  }, [incomingFrom, detail, registered]);

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
            <h1 className="text-2xl font-semibold tracking-tight">VSP Softphone</h1>
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
    <div className="gradient-mesh relative min-h-screen overflow-hidden">
      <audio data-softphone-remote autoPlay playsInline />

      {/* Incoming call overlay */}
      <AnimatePresence>
        {incomingFrom && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-6 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.92, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.92, y: 20 }}
              className="glass-panel w-full max-w-sm rounded-3xl border border-border p-8 text-center shadow-2xl"
            >
              <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-primary/15 text-primary">
                <PhoneIncoming className="h-10 w-10 animate-pulse" />
              </div>
              <p className="text-sm text-muted-foreground">Incoming call</p>
              <p className="mt-1 text-2xl font-semibold">{incomingFrom}</p>
              <div className="mt-8 flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => void clientRef.current?.reject()}>
                  Decline
                </Button>
                <Button className="flex-1" onClick={() => void clientRef.current?.answer()}>
                  Answer
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mx-auto flex min-h-screen max-w-7xl flex-col lg:flex-row">
        {/* Main panel */}
        <div className="flex flex-1 flex-col p-4 sm:p-6 lg:p-8">
          {/* Header */}
          <header className="glass-panel mb-6 flex flex-wrap items-center gap-4 rounded-2xl border border-border p-4 sm:p-5">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <User className="h-7 w-7" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-semibold">{extensionLabel}</p>
              <p className="text-sm text-muted-foreground">{session?.tenantId ? `Tenant ${session.tenantId}` : 'Browser endpoint'}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={presence}
                onChange={(e) => setPresence(e.target.value as typeof presence)}
                className="rounded-xl border border-border bg-background/80 px-3 py-2 text-sm"
              >
                {PRESENCE_OPTIONS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              <span className={cn(
                'rounded-full px-3 py-1 text-xs font-medium',
                registered ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground',
              )}>
                {statusLabel}
              </span>
              {!registered ? (
                <Button size="sm" onClick={() => void handleRegister()}>Register</Button>
              ) : (
                <Button variant="outline" size="sm" onClick={() => void handleLogout()}>Logout</Button>
              )}
            </div>
          </header>

          {/* Dial display */}
          <div className="glass-panel mb-6 rounded-2xl border border-border p-4">
            <Input
              value={dialTarget}
              onChange={(e) => setDialTarget(e.target.value)}
              placeholder="Enter extension or E.164 number"
              className="border-0 bg-transparent text-center text-2xl font-medium tracking-wide shadow-none focus-visible:ring-0"
            />
          </div>

          {/* Dial pad */}
          <div className="mx-auto grid w-full max-w-sm grid-cols-3 gap-3">
            {DIAL_KEYS.map((key) => (
              <motion.button
                key={key}
                type="button"
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                onClick={() => appendDigit(key)}
                className="glass-panel flex h-16 items-center justify-center rounded-2xl border border-border text-2xl font-medium shadow-sm transition-shadow hover:shadow-[var(--shadow-elevated)]"
              >
                {key}
              </motion.button>
            ))}
          </div>

          <div className="mx-auto mt-6 flex w-full max-w-sm gap-3">
            <Button
              className="h-14 flex-1 rounded-2xl text-base"
              onClick={() => void handleCall()}
              disabled={!registered || !dialTarget.trim()}
            >
              <PhoneCall className="h-5 w-5" />
              Call
            </Button>
            <Button
              variant="outline"
              className="h-14 rounded-2xl px-5"
              onClick={() => setDialTarget('')}
            >
              Clear
            </Button>
          </div>

          {/* Bottom tabs */}
          <div className="mt-10">
            <div className="mb-4 flex gap-2 overflow-x-auto">
              {([
                ['recent', 'Recent', Phone],
                ['favorites', 'Favorites', Star],
                ['voicemail', 'Voicemail', Voicemail],
                ['contacts', 'Contacts', User],
              ] as const).map(([id, label, Icon]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={cn(
                    'flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors',
                    tab === id ? 'bg-primary text-primary-foreground' : 'bg-muted/60 text-muted-foreground hover:bg-muted',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
            <div className="glass-panel rounded-2xl border border-border p-6">
              <p className="text-center text-sm text-muted-foreground">
                {tab === 'recent' && 'Recent calls load from CDR when the API is connected.'}
                {tab === 'favorites' && 'No favorites yet. Star contacts to pin them here.'}
                {tab === 'voicemail' && 'Voicemail messages load from the voicemail API.'}
                {tab === 'contacts' && 'Directory contacts sync from the tenant user directory.'}
              </p>
            </div>
          </div>
        </div>

        {/* Right call panel */}
        <aside className="glass-panel flex w-full flex-col border-t border-border p-6 lg:w-96 lg:border-l lg:border-t-0">
          <h2 className="mb-6 text-lg font-semibold">Active Session</h2>
          {inCall ? (
            <div className="flex flex-1 flex-col">
              <div className="mb-6 text-center">
                <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Phone className="h-9 w-9" />
                </div>
                <p className="text-xl font-semibold">{dialTarget || incomingFrom || 'Unknown'}</p>
                <p className="mt-1 text-sm text-muted-foreground">{formatDuration(callDuration)}</p>
              </div>
              <dl className="mb-6 space-y-3 text-sm">
                <div className="flex justify-between"><dt className="text-muted-foreground">Codec</dt><dd>—</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">MOS</dt><dd>—</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Packet loss</dt><dd>—</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Recording</dt><dd>Off</dd></div>
              </dl>
              <div className="mt-auto space-y-2">
                <Button variant="outline" className="w-full" disabled>Transfer</Button>
                <Button variant="outline" className="w-full" disabled>Conference</Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center text-center text-muted-foreground">
              <Phone className="mb-4 h-12 w-12 opacity-30" />
              <p className="text-sm">No active call</p>
              <p className="mt-1 text-xs">Dial a number or answer an incoming call</p>
            </div>
          )}

          {/* Device selectors */}
          {registered && micDevices.length > 0 ? (
            <div className="mt-6 space-y-3 border-t border-border pt-6 text-sm">
              <label className="block">
                <span className="mb-1 block text-muted-foreground">Microphone</span>
                <select
                  value={selectedMic}
                  onChange={(e) => {
                    setSelectedMic(e.target.value);
                    void clientRef.current?.setMicrophone(e.target.value);
                  }}
                  className="w-full rounded-xl border border-border bg-background/80 px-3 py-2"
                >
                  {micDevices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>{d.label || d.deviceId}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-muted-foreground">Speaker</span>
                <select
                  value={selectedSpeaker}
                  onChange={(e) => {
                    setSelectedSpeaker(e.target.value);
                    void clientRef.current?.setSpeaker(e.target.value);
                  }}
                  className="w-full rounded-xl border border-border bg-background/80 px-3 py-2"
                >
                  {speakerDevices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>{d.label || d.deviceId}</option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}
        </aside>
      </div>

      {/* Floating in-call toolbar */}
      <AnimatePresence>
        {inCall && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-card/95 px-4 py-3 shadow-2xl backdrop-blur-xl"
          >
            <ToolbarBtn
              active={muted}
              icon={muted ? MicOff : Mic}
              label="Mute"
              onClick={() => void clientRef.current?.toggleMute().then(setMuted)}
            />
            <ToolbarBtn
              active={held}
              icon={held ? Play : Pause}
              label="Hold"
              onClick={() => void clientRef.current?.toggleHold().then(setHeld)}
            />
            <ToolbarBtn icon={PhoneForwarded} label="Transfer" disabled />
            <ToolbarBtn
              active={showKeypad}
              icon={Grid3X3}
              label="Keypad"
              onClick={() => setShowKeypad((v) => !v)}
            />
            <ToolbarBtn icon={Volume2} label="Speaker" disabled />
            <ToolbarBtn icon={Video} label="Video" disabled />
            <button
              type="button"
              onClick={() => void clientRef.current?.hangup()}
              className="ml-2 flex h-12 w-12 items-center justify-center rounded-full bg-destructive text-white shadow-lg transition-transform hover:scale-105"
              aria-label="Hang up"
            >
              <PhoneOff className="h-5 w-5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ToolbarBtn({
  icon: Icon,
  label,
  onClick,
  active,
  disabled,
}: {
  icon: typeof Mic;
  label: string;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={label}
      className={cn(
        'flex h-11 w-11 items-center justify-center rounded-full transition-colors',
        active ? 'bg-primary text-primary-foreground' : 'bg-muted/80 text-foreground hover:bg-muted',
        disabled && 'cursor-not-allowed opacity-40',
      )}
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}
