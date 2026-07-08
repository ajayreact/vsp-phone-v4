'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  clearToken,
  enroll,
  getStoredToken,
  login,
  revokeEnroll,
  storeToken,
  updatePresence,
} from '../../lib/api-client';
import { SipSoftphoneClient } from '../../lib/softphone/sip-softphone';
import type { SoftphoneState } from '../../lib/softphone/types';
import styles from './softphone.module.css';

export function SoftphonePanel() {
  const clientRef = useRef<SipSoftphoneClient | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [dialTarget, setDialTarget] = useState('');
  const [state, setState] = useState<SoftphoneState>('idle');
  const [detail, setDetail] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  const [incomingFrom, setIncomingFrom] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [held, setHeld] = useState(false);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([]);
  const [speakerDevices, setSpeakerDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedMic, setSelectedMic] = useState('');
  const [selectedSpeaker, setSelectedSpeaker] = useState('');

  const appendLog = useCallback((msg: string) => {
    setLogs((prev) => [...prev.slice(-40), `${new Date().toLocaleTimeString()} ${msg}`]);
  }, []);

  useEffect(() => {
    setToken(getStoredToken());
  }, []);

  useEffect(() => {
    const client = new SipSoftphoneClient();
    clientRef.current = client;
    const off = client.on((ev) => {
      if (ev.type === 'state') {
        setState(ev.state);
        setDetail(ev.detail ?? '');
      } else if (ev.type === 'log') {
        appendLog(ev.message);
      } else if (ev.type === 'incoming') {
        setIncomingFrom(ev.from);
      }
    });
    return () => {
      off();
      void client.disconnect();
    };
  }, [appendLog]);

  const loadDevices = useCallback(async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const { inputs, outputs } = await clientRef.current!.listAudioDevices();
      setMicDevices(inputs);
      setSpeakerDevices(outputs);
      if (inputs[0]) setSelectedMic(inputs[0].deviceId);
      if (outputs[0]) setSelectedSpeaker(outputs[0].deviceId);
    } catch (err) {
      appendLog(`Device enumeration failed: ${String(err)}`);
    }
  }, [appendLog]);

  const handleLogin = async () => {
    const res = await login(email, password);
    storeToken(res.accessToken);
    setToken(res.accessToken);
    appendLog(`Logged in as ${res.email}`);
  };

  const handleRegister = async () => {
    if (!token) return;
    const e = await enroll(token);
    setDeviceId(e.deviceId);
    appendLog(`Enrolled until ${e.expiresAt}`);
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
    appendLog('Logged out');
  };

  const handleCall = async () => {
    if (!dialTarget.trim()) return;
    await clientRef.current?.call(dialTarget.trim());
  };

  const statusLabel = useMemo(() => {
    if (state === 'ringing' && incomingFrom) return `Incoming: ${incomingFrom}`;
    return detail ? `${state} — ${detail}` : state;
  }, [state, detail, incomingFrom]);

  return (
    <div className={styles.panel}>
      <audio data-softphone-remote autoPlay playsInline />
      <header className={styles.header}>
        <h1>Browser Softphone</h1>
        <p className={styles.status}>{statusLabel}</p>
      </header>

      {!token ? (
        <section className={styles.card}>
          <h2>Sign in</h2>
          <label>
            Email
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
          </label>
          <label>
            Password
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
            />
          </label>
          <button type="button" className={styles.button} onClick={() => void handleLogin()}>
            Login (JWT)
          </button>
        </section>
      ) : (
        <>
          <section className={styles.card}>
            <h2>SIP / WSS</h2>
            <div className={styles.row}>
              <button type="button" className={styles.button} onClick={() => void handleRegister()} disabled={state !== 'idle' && state !== 'registered' && state !== 'error'}>
                Register via WSS
              </button>
              <button type="button" className={styles.button} onClick={() => void handleLogout()}>
                Logout / Revoke
              </button>
            </div>
          </section>

          <section className={styles.card}>
            <h2>Dial</h2>
            <input
              placeholder="Extension or E.164 (+15551234567)"
              value={dialTarget}
              onChange={(e) => setDialTarget(e.target.value)}
            />
            <div className={styles.row}>
              <button type="button" className={styles.button} onClick={() => void handleCall()} disabled={state !== 'registered'}>
                Call (INVITE)
              </button>
              <button type="button" className={styles.button} onClick={() => void clientRef.current?.hangup()}>
                Hangup (BYE)
              </button>
            </div>
            {incomingFrom && (
              <div className={styles.row}>
                <button type="button" className={styles.button} onClick={() => void clientRef.current?.answer()}>
                  Answer
                </button>
                <button type="button" className={styles.button} onClick={() => void clientRef.current?.reject()}>
                  Reject
                </button>
              </div>
            )}
          </section>

          <section className={styles.card}>
            <h2>In-call controls</h2>
            <div className={styles.row}>
              <button
                type="button"
                className={styles.button}
                onClick={() => void clientRef.current?.toggleMute().then(setMuted)}
              >
                {muted ? 'Unmute' : 'Mute'}
              </button>
              <button
                type="button"
                className={styles.button}
                onClick={() => void clientRef.current?.toggleHold().then(setHeld)}
              >
                {held ? 'Resume' : 'Hold'}
              </button>
            </div>
            <label>
              Microphone
              <select
                value={selectedMic}
                onChange={(e) => {
                  setSelectedMic(e.target.value);
                  void clientRef.current?.setMicrophone(e.target.value);
                }}
              >
                {micDevices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || d.deviceId}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Speaker
              <select
                value={selectedSpeaker}
                onChange={(e) => {
                  setSelectedSpeaker(e.target.value);
                  void clientRef.current?.setSpeaker(e.target.value);
                }}
              >
                {speakerDevices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || d.deviceId}
                  </option>
                ))}
              </select>
            </label>
          </section>
        </>
      )}

      <section className={styles.log}>
        <h2>Event log</h2>
        <pre>{logs.join('\n')}</pre>
      </section>
    </div>
  );
}
