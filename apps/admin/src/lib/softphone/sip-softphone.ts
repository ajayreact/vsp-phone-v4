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
import type { EnrollConfig, SoftphoneEvent, SoftphoneState } from './types';

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

/**
 * Phase 10 — SIP.js browser UA over WSS (ADR-038).
 * SDP/ICE/DTLS remain in browser + RTPengine only — never sent to NestJS.
 */
export class SipSoftphoneClient {
  private ua: UserAgent | null = null;
  private registerer: Registerer | null = null;
  private session: Session | null = null;
  private config: EnrollConfig | null = null;
  private listeners = new Set<Listener>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private enrollRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  private muted = false;
  private held = false;
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

  private log(message: string): void {
    this.emit({ type: 'log', message });
  }

  async connect(config: EnrollConfig): Promise<void> {
    this.config = config;
    this.setState('connecting');
    await this.startUa(config);
    this.scheduleEnrollRefresh(config.expiresAt, config.onReEnroll);
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
          this.handleIncoming(invitation);
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

  private handleIncoming(invitation: Invitation): void {
    if (this.session) {
      invitation.reject();
      return;
    }
    this.session = invitation;
    this.bindSession(invitation);
    const from = invitation.remoteIdentity.uri.toString();
    this.emit({ type: 'incoming', from });
    this.setState('ringing', from);
  }

  async answer(): Promise<void> {
    if (!(this.session instanceof Invitation)) return;
    await this.session.accept();
    this.setState('in-call');
  }

  async reject(): Promise<void> {
    if (!(this.session instanceof Invitation)) return;
    await this.session.reject();
    this.session = null;
    this.setState('registered');
  }

  async call(target: string): Promise<void> {
    if (!this.ua || !this.registerer) throw new Error('Not connected');
    const dest = target.includes('@') ? target : `${target}@${this.config?.aor.split('@')[1]}`;
    const uri = UserAgent.makeURI(dest.startsWith('sip:') ? dest : `sip:${dest}`);
    if (!uri) throw new Error('Invalid dial target');
    const inviter = new Inviter(this.ua, uri);
    this.session = inviter;
    this.bindSession(inviter);
    this.setState('calling', dest);
    await inviter.invite();
  }

  async hangup(): Promise<void> {
    if (!this.session) return;
    const state = this.session.state;
    if (state === SessionState.Established) {
      await this.session.bye();
    } else if (this.session instanceof Inviter) {
      await this.session.cancel();
    } else if (this.session instanceof Invitation) {
      await this.session.reject();
    }
    this.session = null;
    this.held = false;
    this.muted = false;
    this.setState('registered');
  }

  async toggleMute(): Promise<boolean> {
    this.muted = !this.muted;
    const pc = this.getPeerConnection();
    pc?.getSenders().forEach((s) => {
      if (s.track?.kind === 'audio') s.track.enabled = !this.muted;
    });
    this.log(this.muted ? 'Muted' : 'Unmuted');
    return this.muted;
  }

  isMuted(): boolean {
    return this.muted;
  }

  async toggleHold(): Promise<boolean> {
    if (!this.session || this.session.state !== SessionState.Established) {
      return this.held;
    }
    this.held = !this.held;
    if (this.held) {
      await this.session.invite({ sessionDescriptionHandlerModifiers: [holdModifier] });
      this.setState('held');
      this.log('On hold');
    } else {
      await this.session.invite({ sessionDescriptionHandlerModifiers: [unholdModifier] });
      this.setState('in-call');
      this.log('Resumed');
    }
    return this.held;
  }

  isHeld(): boolean {
    return this.held;
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
    const pc = this.getPeerConnection();
    if (!pc) return;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: { exact: deviceId } },
      video: false,
    });
    const newTrack = stream.getAudioTracks()[0];
    const sender = pc.getSenders().find((s) => s.track?.kind === 'audio');
    if (sender && newTrack) {
      await sender.replaceTrack(newTrack);
      this.log(`Microphone switched: ${deviceId}`);
    }
  }

  async setSpeaker(deviceId: string): Promise<void> {
    this.currentSpeakerId = deviceId;
    const audio = document.querySelector('audio[data-softphone-remote]') as HTMLAudioElement | null;
    if (audio && 'setSinkId' in audio) {
      await (audio as HTMLAudioElement & { setSinkId: (id: string) => Promise<void> }).setSinkId(
        deviceId,
      );
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
    this.session = null;
    this.setState('idle');
  }

  private bindSession(session: Session): void {
    session.stateChange.addListener((state) => {
      if (state === SessionState.Established) {
        this.setState('in-call');
        this.attachRemoteAudio(session);
        this.log('Call established (DTLS-SRTP via RTPengine)');
      } else if (state === SessionState.Terminated) {
        this.session = null;
        this.held = false;
        this.setState('registered');
        this.log('Call ended');
      }
    });
  }

  private attachRemoteAudio(session: Session): void {
    const pc = (session.sessionDescriptionHandler as SessionDescriptionHandler | undefined)
      ?.peerConnection;
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
      void (
        audio as HTMLAudioElement & { setSinkId: (id: string) => Promise<void> }
      ).setSinkId(this.currentSpeakerId);
    }
  }

  private getPeerConnection(): RTCPeerConnection | undefined {
    const sdh = this.session?.sessionDescriptionHandler as SessionDescriptionHandler | undefined;
    return sdh?.peerConnection;
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

  private scheduleEnrollRefresh(
    expiresAt: string,
    onReEnroll: EnrollConfig['onReEnroll'],
  ): void {
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
    this.reconnectTimer = null;
    this.enrollRefreshTimer = null;
  }
}
