'use client';

import {
  Inviter,
  Invitation,
  Registerer,
  RegistererState,
  Session,
  SessionState,
  UserAgent,
  type UserAgentOptions,
} from 'sip.js';
import { holdModifier } from 'sip.js/lib/platform/web';
import type { SessionDescriptionHandler } from 'sip.js/lib/platform/web';
import type {
  CallSessionInfo,
  EnrollConfig,
  NetworkQuality,
  SoftphoneEvent,
  SoftphoneState,
} from './types';
import {
  type CallPhase,
  callPhaseFromProvisional,
  callPhaseFromSipStatus,
  isTerminalCallPhase,
} from './call-state';

type Listener = (event: SoftphoneEvent) => void;

function unholdModifier(description: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
  if (!description.sdp || !description.type) {
    return Promise.reject(new Error('Invalid SDP'));
  }
  let sdp = description.sdp;
  sdp = sdp.replace(/a=sendonly\r\n/g, 'a=sendrecv\r\n');
  sdp = sdp.replace(/a=inactive\r\n/g, 'a=recvonly\r\n');
  return Promise.resolve({ sdp, type: description.type });
}

function estimateMos(jitterMs: number, packetLossPct: number, rttMs: number): number {
  const r = Math.min(100, packetLossPct);
  const j = Math.min(100, jitterMs);
  const lat = Math.min(500, rttMs);
  const score = 4.5 - r * 0.035 - j * 0.01 - lat * 0.002;
  return Math.max(1, Math.min(4.5, Math.round(score * 10) / 10));
}

/**
 * Phase 10 — SIP.js browser UA over WSS (ADR-038).
 * SDP/ICE/DTLS remain in browser + RTPengine only — never sent to NestJS.
 */
export class SipSoftphoneClient {
  private ua: UserAgent | null = null;
  private registerer: Registerer | null = null;
  private sessions = new Map<string, Session>();
  private activeSessionId: string | null = null;
  private config: EnrollConfig | null = null;
  private listeners = new Set<Listener>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private enrollRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  private statsTimer: ReturnType<typeof setInterval> | null = null;
  private endClearTimer: ReturnType<typeof setTimeout> | null = null;
  private sessionMeta = new Map<
    string,
    {
      muted: boolean;
      held: boolean;
      remote: string;
      direction: 'inbound' | 'outbound';
      connectedAt: number | null;
      phase: CallPhase;
    }
  >();
  private currentMicId: string | null = null;
  private currentSpeakerId: string | null = null;

  on(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: SoftphoneEvent): void {
    for (const l of this.listeners) l(event);
  }

  private setState(state: SoftphoneState, detail?: string): void {
    this.emit({ type: 'state', state, detail });
  }

  private setCallPhase(id: string, phase: CallPhase, detail?: string): void {
    const meta = this.sessionMeta.get(id);
    if (meta) {
      meta.phase = phase;
    }
    if (this.activeSessionId === id) {
      this.setState(phase, detail);
    }
    this.emitSessions();
  }

  /** Set connectedAt once on 200 OK — never reset on hold/re-INVITE. */
  private markConnected(id: string): void {
    const meta = this.sessionMeta.get(id);
    if (!meta || meta.connectedAt != null) return;
    meta.connectedAt = Date.now();
    this.emitSessions();
  }

  private newSessionMeta(
    remote: string,
    direction: 'inbound' | 'outbound',
    phase: CallPhase,
  ): {
    muted: boolean;
    held: boolean;
    remote: string;
    direction: 'inbound' | 'outbound';
    connectedAt: number | null;
    phase: CallPhase;
  } {
    return {
      muted: false,
      held: false,
      remote,
      direction,
      connectedAt: null,
      phase,
    };
  }

  private log(message: string): void {
    this.emit({ type: 'log', message });
  }

  private emitSessions(): void {
    const sessions: CallSessionInfo[] = [];
    for (const [id, meta] of this.sessionMeta) {
      sessions.push({
        id,
        remote: meta.remote,
        direction: meta.direction,
        connectedAt: meta.connectedAt,
        phase: meta.phase,
        held: meta.held,
        muted: meta.muted,
      });
    }
    this.emit({ type: 'sessions', sessions });
  }

  async connect(config: EnrollConfig): Promise<void> {
    this.config = config;
    this.setState('connecting');
    await this.startUa(config);
    this.scheduleEnrollRefresh(config.expiresAt, config.onReEnroll);
    this.startStatsPolling();
  }

  private async startUa(config: EnrollConfig): Promise<void> {
    if (this.ua) {
      try {
        await this.registerer?.unregister();
      } catch {
        /* ignore */
      }
      try {
        await this.ua.stop();
      } catch {
        /* ignore */
      }
    }

    const uri = UserAgent.makeURI(config.aor);
    if (!uri) {
      throw new Error(`Invalid AOR: ${config.aor}`);
    }

    const options: UserAgentOptions = {
      uri,
      transportOptions: {
        server: config.wssUrl,
        connectionTimeout: 15,
      },
      authorizationUsername: config.sipUsername,
      authorizationPassword: config.sipPassword,
      displayName: config.sipUsername,
      sessionDescriptionHandlerFactoryOptions: {
        peerConnectionConfiguration: {
          iceServers: config.iceServers,
          bundlePolicy: 'max-bundle',
        },
        constraints: { audio: true, video: false },
      },
      delegate: {
        onInvite: (invitation: Invitation) => {
          void this.handleIncoming(invitation);
        },
      },
    };

    this.ua = new UserAgent(options);
    this.ua.transport.onConnect = () => this.log('WSS connected');
    this.ua.transport.onDisconnect = (error) => {
      this.log(`WSS disconnected${error ? `: ${error.message}` : ''}`);
      this.scheduleReconnect();
    };

    await this.ua.start();
    this.registerer = new Registerer(this.ua);
    this.registerer.stateChange.addListener((state) => {
      if (state === RegistererState.Registered) {
        this.setState('registered');
        this.log('SIP REGISTERED');
      } else if (state === RegistererState.Unregistered) {
        this.log('SIP unregistered');
      }
    });
    await this.registerer.register();
  }

  private sessionId(session: Session): string {
    return session.id;
  }

  private async handleIncoming(invitation: Invitation): Promise<void> {
    const id = this.sessionId(invitation);
    const from = invitation.remoteIdentity.uri.toString();

    if (this.activeSessionId && this.sessions.has(this.activeSessionId)) {
      this.sessions.set(id, invitation);
      this.sessionMeta.set(id, this.newSessionMeta(from, 'inbound', 'ringing'));
      this.emit({ type: 'waiting', from, sessionId: id });
      this.emitSessions();
      return;
    }

    this.sessions.set(id, invitation);
    this.activeSessionId = id;
    this.sessionMeta.set(id, this.newSessionMeta(from, 'inbound', 'ringing'));
    this.bindSession(invitation, id);
    this.emit({ type: 'incoming', from, sessionId: id });
    this.setCallPhase(id, 'ringing', from);
    this.emitSessions();
  }

  async answer(sessionId?: string): Promise<void> {
    const id = sessionId ?? this.activeSessionId;
    if (!id) return;
    const session = this.sessions.get(id);
    if (!(session instanceof Invitation)) return;
    await session.accept({
      requestDelegate: {
        onAccept: () => {
          this.markConnected(id);
          this.setCallPhase(id, 'connected');
        },
      },
    });
    this.activeSessionId = id;
    this.setCallPhase(id, 'active');
    this.emitSessions();
  }

  async reject(sessionId?: string): Promise<void> {
    const id = sessionId ?? this.activeSessionId;
    if (!id) return;
    const session = this.sessions.get(id);
    if (!(session instanceof Invitation)) return;
    await session.reject();
    this.setCallPhase(id, 'cancelled');
    this.removeSession(id);
    this.setState(this.sessions.size ? 'active' : 'registered');
  }

  async call(target: string): Promise<void> {
    if (!this.ua || !this.registerer) throw new Error('Not connected');
    const dest = target.includes('@') ? target : `${target}@${this.config?.aor.split('@')[1]}`;
    const uri = UserAgent.makeURI(dest.startsWith('sip:') ? dest : `sip:${dest}`);
    if (!uri) throw new Error('Invalid dial target');
    const inviter = new Inviter(this.ua, uri);
    const id = this.sessionId(inviter);
    this.sessions.set(id, inviter);
    this.activeSessionId = id;
    this.sessionMeta.set(id, this.newSessionMeta(dest, 'outbound', 'dialing'));
    this.bindSession(inviter, id);
    this.setCallPhase(id, 'dialing', dest);

    let sawTrying = false;
    await inviter.invite({
      requestDelegate: {
        onTrying: () => {
          sawTrying = true;
          this.setCallPhase(id, 'trying');
        },
        onProgress: (response) => {
          const code = response.message.statusCode;
          if (code === 100) {
            this.setCallPhase(id, 'trying');
            return;
          }
          if (code === 180 || code === 183) {
            this.setCallPhase(id, 'ringing');
            return;
          }
          this.setCallPhase(id, callPhaseFromProvisional(code, sawTrying));
        },
        onAccept: () => {
          this.markConnected(id);
          this.setCallPhase(id, 'connected');
        },
        onReject: (response) => {
          const code = response.message.statusCode;
          const phase = callPhaseFromSipStatus(code);
          if (phase && isTerminalCallPhase(phase)) {
            this.setCallPhase(id, phase);
          }
        },
      },
    });
    this.emitSessions();
  }

  async hangup(sessionId?: string): Promise<void> {
    const id = sessionId ?? this.activeSessionId;
    if (!id) return;
    const session = this.sessions.get(id);
    if (!session) return;
    const state = session.state;
    if (state === SessionState.Established) {
      await session.bye();
    } else if (session instanceof Inviter) {
      this.setCallPhase(id, 'cancelled');
      await session.cancel();
    } else if (session instanceof Invitation) {
      await session.reject();
    }
    // Session cleanup + terminal UI state handled in bindSession Terminated handler.
  }

  async toggleMute(sessionId?: string): Promise<boolean> {
    const id = sessionId ?? this.activeSessionId;
    if (!id) return false;
    const meta = this.sessionMeta.get(id);
    if (!meta) return false;
    meta.muted = !meta.muted;
    const pc = this.getPeerConnection(id);
    pc?.getSenders().forEach((s) => {
      if (s.track?.kind === 'audio') s.track.enabled = !meta.muted;
    });
    this.log(meta.muted ? 'Muted' : 'Unmuted');
    this.emitSessions();
    return meta.muted;
  }

  isMuted(sessionId?: string): boolean {
    const id = sessionId ?? this.activeSessionId;
    return this.sessionMeta.get(id ?? '')?.muted ?? false;
  }

  async toggleHold(sessionId?: string): Promise<boolean> {
    const id = sessionId ?? this.activeSessionId;
    if (!id) return false;
    const session = this.sessions.get(id);
    const meta = this.sessionMeta.get(id);
    if (!session || !meta || session.state !== SessionState.Established) return meta?.held ?? false;

    meta.held = !meta.held;
    if (meta.held) {
      await session.invite({ sessionDescriptionHandlerModifiers: [holdModifier] });
      this.setCallPhase(id, 'hold');
      this.log('On hold');
    } else {
      await session.invite({ sessionDescriptionHandlerModifiers: [unholdModifier] });
      this.setCallPhase(id, 'active');
      this.log('Resumed');
    }
    this.emitSessions();
    return meta.held;
  }

  isHeld(sessionId?: string): boolean {
    const id = sessionId ?? this.activeSessionId;
    return this.sessionMeta.get(id ?? '')?.held ?? false;
  }

  async sendDtmf(tone: string, sessionId?: string): Promise<void> {
    const id = sessionId ?? this.activeSessionId;
    const session = id ? this.sessions.get(id) : null;
    if (!session) return;
    const sdh = session.sessionDescriptionHandler as SessionDescriptionHandler & {
      sendDtmf?: (tone: string) => void;
    };
    if (sdh?.sendDtmf) {
      sdh.sendDtmf(tone);
      this.log(`DTMF ${tone}`);
    }
  }

  async blindTransfer(target: string, sessionId?: string): Promise<void> {
    const id = sessionId ?? this.activeSessionId;
    if (!id) throw new Error('No active call');
    const session = this.sessions.get(id);
    if (!session) throw new Error('Session not found');
    const dest = target.includes('@') ? target : `${target}@${this.config?.aor.split('@')[1]}`;
    const uri = UserAgent.makeURI(dest.startsWith('sip:') ? dest : `sip:${dest}`);
    if (!uri) throw new Error('Invalid transfer target');
    await session.refer(uri);
    this.log(`Blind transfer to ${dest}`);
    this.removeSession(id);
    if (!this.sessions.size) {
      this.setState('ended');
      if (this.endClearTimer) clearTimeout(this.endClearTimer);
      this.endClearTimer = setTimeout(() => {
        this.endClearTimer = null;
        if (!this.sessions.size) this.setState('registered');
      }, 1500);
    } else {
      const nextMeta = this.activeSessionId ? this.sessionMeta.get(this.activeSessionId) : null;
      this.setState(nextMeta?.phase ?? 'active');
    }
  }

  async switchToSession(sessionId: string): Promise<void> {
    if (!this.sessions.has(sessionId)) return;
    this.activeSessionId = sessionId;
    const session = this.sessions.get(sessionId)!;
    const meta = this.sessionMeta.get(sessionId);
    this.attachRemoteAudio(session);
    if (meta) {
      this.setCallPhase(sessionId, meta.phase);
    } else {
      this.setState(session.state === SessionState.Established ? 'active' : 'ringing');
    }
    this.emitSessions();
  }

  getActiveSessionId(): string | null {
    return this.activeSessionId;
  }

  getRegistrationState(): 'registered' | 'unregistered' | 'connecting' {
    if (!this.registerer) return 'unregistered';
    if (this.registerer.state === RegistererState.Registered) return 'registered';
    return 'connecting';
  }

  async listAudioDevices(): Promise<{ inputs: MediaDeviceInfo[]; outputs: MediaDeviceInfo[] }> {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return {
      inputs: devices.filter((d) => d.kind === 'audioinput'),
      outputs: devices.filter((d) => d.kind === 'audiooutput'),
    };
  }

  async setMicrophone(deviceId: string): Promise<void> {
    this.currentMicId = deviceId;
    for (const id of this.sessions.keys()) {
      const pc = this.getPeerConnection(id);
      if (!pc) continue;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: deviceId } },
        video: false,
      });
      const newTrack = stream.getAudioTracks()[0];
      const sender = pc.getSenders().find((s) => s.track?.kind === 'audio');
      if (sender && newTrack) await sender.replaceTrack(newTrack);
    }
    this.log(`Microphone switched: ${deviceId}`);
  }

  async setSpeaker(deviceId: string): Promise<void> {
    this.currentSpeakerId = deviceId;
    const audio = document.querySelector('audio[data-softphone-remote]') as HTMLAudioElement | null;
    if (audio && 'setSinkId' in audio) {
      await (audio as HTMLAudioElement & { setSinkId: (id: string) => Promise<void> }).setSinkId(deviceId);
      this.log(`Speaker switched: ${deviceId}`);
    }
  }

  getCurrentMicId(): string | null {
    return this.currentMicId;
  }

  getCurrentSpeakerId(): string | null {
    return this.currentSpeakerId;
  }

  async disconnect(): Promise<void> {
    this.clearTimers();
    if (this.config) {
      try {
        await this.registerer?.unregister();
      } catch {
        /* ignore */
      }
    }
    if (this.ua) {
      await this.ua.stop();
    }
    this.ua = null;
    this.registerer = null;
    this.sessions.clear();
    this.sessionMeta.clear();
    this.activeSessionId = null;
    this.setState('idle');
  }

  private removeSession(id: string): void {
    this.sessions.delete(id);
    this.sessionMeta.delete(id);
    if (this.activeSessionId === id) {
      const next = this.sessions.keys().next().value as string | undefined;
      this.activeSessionId = next ?? null;
      if (next) {
        const session = this.sessions.get(next)!;
        this.attachRemoteAudio(session);
      }
    }
    this.emitSessions();
  }

  private finishCallSession(id: string): void {
    const meta = this.sessionMeta.get(id);
    const terminalPhase: CallPhase =
      meta?.phase && isTerminalCallPhase(meta.phase)
        ? meta.phase
        : meta?.connectedAt != null
          ? 'ended'
          : 'cancelled';
    const wasActive = this.activeSessionId === id;
    this.removeSession(id);
    if (!this.sessions.size && wasActive) {
      this.setState(terminalPhase);
      if (this.endClearTimer) clearTimeout(this.endClearTimer);
      this.endClearTimer = setTimeout(() => {
        this.endClearTimer = null;
        if (!this.sessions.size) this.setState('registered');
      }, 1500);
    } else if (wasActive && this.activeSessionId) {
      const nextMeta = this.sessionMeta.get(this.activeSessionId);
      this.setState(nextMeta?.phase ?? 'active');
    }
  }

  private bindSession(session: Session, id: string): void {
    session.stateChange.addListener((state) => {
      if (state === SessionState.Established) {
        this.markConnected(id);
        if (this.activeSessionId === id) this.setCallPhase(id, 'active');
        this.attachRemoteAudio(session);
        this.log('Call established (DTLS-SRTP via RTPengine)');
      } else if (state === SessionState.Terminated) {
        this.finishCallSession(id);
        this.log('Call ended');
      }
    });
  }

  private attachRemoteAudio(session: Session): void {
    const pc = (session.sessionDescriptionHandler as SessionDescriptionHandler | undefined)?.peerConnection;
    if (!pc) return;
    const audio = document.querySelector('audio[data-softphone-remote]') as HTMLAudioElement | null;
    if (!audio) return;
    const remoteStream = new MediaStream();
    pc.getReceivers().forEach((r) => {
      if (r.track) remoteStream.addTrack(r.track);
    });
    audio.srcObject = remoteStream;
    void audio.play().catch(() => undefined);
    if (this.currentSpeakerId && 'setSinkId' in audio) {
      void (audio as HTMLAudioElement & { setSinkId: (id: string) => Promise<void> }).setSinkId(
        this.currentSpeakerId,
      );
    }
  }

  private getPeerConnection(sessionId: string): RTCPeerConnection | undefined {
    const sdh = this.sessions.get(sessionId)?.sessionDescriptionHandler as SessionDescriptionHandler | undefined;
    return sdh?.peerConnection;
  }

  private startStatsPolling(): void {
    if (this.statsTimer) clearInterval(this.statsTimer);
    this.statsTimer = setInterval(() => {
      void this.pollStats();
    }, 3000);
  }

  private async pollStats(): Promise<void> {
    const id = this.activeSessionId;
    if (!id) return;
    const pc = this.getPeerConnection(id);
    if (!pc) return;
    try {
      const report = await pc.getStats();
      let jitterMs = 0;
      let packetsLost = 0;
      let packetsReceived = 0;
      let rttMs = 0;
      report.forEach((stat) => {
        if (stat.type === 'inbound-rtp' && stat.kind === 'audio') {
          jitterMs = (stat.jitter as number) * 1000;
          packetsLost = stat.packetsLost as number;
          packetsReceived = stat.packetsReceived as number;
        }
        if (stat.type === 'candidate-pair' && stat.state === 'succeeded') {
          rttMs = (stat.currentRoundTripTime as number) * 1000;
        }
      });
      const packetLossPct =
        packetsReceived + packetsLost > 0 ? (packetsLost / (packetsReceived + packetsLost)) * 100 : 0;
      const stats: NetworkQuality = {
        jitterMs: Math.round(jitterMs * 10) / 10,
        packetLossPct: Math.round(packetLossPct * 10) / 10,
        rttMs: Math.round(rttMs * 10) / 10,
        mos: estimateMos(jitterMs, packetLossPct, rttMs),
      };
      this.emit({ type: 'stats', stats });
    } catch {
      /* stats optional */
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.reconnect();
    }, 3000);
  }

  private async reconnect(): Promise<void> {
    if (!this.config) return;
    this.log('Reconnecting WSS…');
    try {
      const fresh = await this.config.onReEnroll();
      this.config.sipPassword = fresh.sipPassword;
      this.config.wssUrl = fresh.wssUrl;
      this.config.iceServers = fresh.iceServers;
      this.config.expiresAt = fresh.expiresAt;
      await this.startUa(this.config);
      this.scheduleEnrollRefresh(this.config.expiresAt, this.config.onReEnroll);
    } catch (err) {
      this.setState('error', err instanceof Error ? err.message : 'Reconnect failed');
      this.scheduleReconnect();
    }
  }

  private scheduleEnrollRefresh(expiresAt: string, onReEnroll: EnrollConfig['onReEnroll']): void {
    if (this.enrollRefreshTimer) clearTimeout(this.enrollRefreshTimer);
    const ms = new Date(expiresAt).getTime() - Date.now() - 60_000;
    if (ms <= 0) return;
    this.enrollRefreshTimer = setTimeout(() => {
      void onReEnroll()
        .then((fresh) => {
          if (!this.config) return;
          this.config.sipPassword = fresh.sipPassword;
          this.config.expiresAt = fresh.expiresAt;
          this.log('Enroll credentials refreshed');
          void this.registerer?.register();
          this.scheduleEnrollRefresh(fresh.expiresAt, onReEnroll);
        })
        .catch((err) => this.log(`Enroll refresh failed: ${String(err)}`));
    }, ms);
  }

  private clearTimers(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.enrollRefreshTimer) clearTimeout(this.enrollRefreshTimer);
    if (this.endClearTimer) clearTimeout(this.endClearTimer);
    if (this.statsTimer) clearInterval(this.statsTimer);
    this.reconnectTimer = null;
    this.enrollRefreshTimer = null;
    this.endClearTimer = null;
    this.statsTimer = null;
  }
}
