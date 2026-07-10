import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import dgram from 'node:dgram';

/** Minimal RTPengine NG protocol client (list / ping). */
@Injectable()
export class RtpengineNgClient {
  private readonly logger = new Logger(RtpengineNgClient.name);
  private readonly host: string;
  private readonly port: number;

  constructor(private readonly config: ConfigService) {
    this.host = this.config.get<string>('RTPENGINE_HOST') ?? 'localhost';
    this.port = Number(this.config.get('RTPENGINE_NG_PORT') ?? '2223');
  }

  async ping(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    const started = Date.now();
    try {
      await this.sendCommand({ command: 'ping' });
      return { ok: true, latencyMs: Date.now() - started };
    } catch (err) {
      return {
        ok: false,
        latencyMs: Date.now() - started,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async listSessions(): Promise<{ ok: boolean; sessions?: unknown; error?: string }> {
    try {
      const result = await this.sendCommand({ command: 'list' });
      return { ok: true, sessions: result };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private sendCommand(payload: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const body = this.encodeBencode(payload);
      const socket = dgram.createSocket('udp4');
      const timeout = setTimeout(() => {
        socket.close();
        reject(new Error('RTPengine NG timeout'));
      }, 3000);

      socket.on('message', (msg) => {
        clearTimeout(timeout);
        socket.close();
        try {
          resolve(this.decodeBencode(msg));
        } catch {
          resolve({ raw: msg.toString('utf8') });
        }
      });

      socket.on('error', (err) => {
        clearTimeout(timeout);
        socket.close();
        reject(err);
      });

      socket.send(body, this.port, this.host, (err) => {
        if (err) {
          clearTimeout(timeout);
          socket.close();
          reject(err);
        }
      });
    });
  }

  private encodeBencode(value: unknown): Buffer {
    if (typeof value === 'string') {
      const buf = Buffer.from(value, 'utf8');
      return Buffer.concat([Buffer.from(`${buf.length}:`), buf]);
    }
    if (typeof value === 'number') {
      return Buffer.from(`i${Math.trunc(value)}e`);
    }
    if (Array.isArray(value)) {
      const parts = value.map((v) => this.encodeBencode(v));
      return Buffer.concat([Buffer.from('l'), ...parts, Buffer.from('e')]);
    }
    if (value && typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      const keys = Object.keys(obj).sort();
      const parts: Buffer[] = [Buffer.from('d')];
      for (const k of keys) {
        parts.push(this.encodeBencode(k), this.encodeBencode(obj[k]));
      }
      parts.push(Buffer.from('e'));
      return Buffer.concat(parts);
    }
    return Buffer.from('0:');
  }

  private decodeBencode(buf: Buffer): unknown {
    const [val] = this.decodeAt(buf, 0);
    return val;
  }

  private decodeAt(buf: Buffer, i: number): [unknown, number] {
    const c = buf[i];
    if (c === undefined) return [null, i];
    if (c === 0x6c) {
      const items: unknown[] = [];
      let pos = i + 1;
      while (buf[pos] !== 0x65) {
        const [v, next] = this.decodeAt(buf, pos);
        items.push(v);
        pos = next;
      }
      return [items, pos + 1];
    }
    if (c === 0x64) {
      const obj: Record<string, unknown> = {};
      let pos = i + 1;
      while (buf[pos] !== 0x65) {
        const [k, p1] = this.decodeAt(buf, pos);
        const [v, p2] = this.decodeAt(buf, p1);
        obj[String(k)] = v;
        pos = p2;
      }
      return [obj, pos + 1];
    }
    if (c === 0x69) {
      const end = buf.indexOf(0x65, i);
      const num = Number(buf.subarray(i + 1, end).toString('utf8'));
      return [num, end + 1];
    }
    const colon = buf.indexOf(0x3a, i);
    const len = Number(buf.subarray(i, colon).toString('utf8'));
    const start = colon + 1;
    return [buf.subarray(start, start + len).toString('utf8'), start + len];
  }
}
