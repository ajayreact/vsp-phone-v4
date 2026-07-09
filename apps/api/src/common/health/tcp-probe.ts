import dgram from 'node:dgram';
import net from 'node:net';

export interface TcpProbeResult {
  status: 'up' | 'down';
  latencyMs?: number;
  detail?: string;
}

/** RTPengine NG control plane listens on UDP — TCP probes always fail. */
export function udpProbe(host: string, port: number, timeoutMs = 1500): Promise<TcpProbeResult> {
  const started = Date.now();
  return new Promise((resolve) => {
    const socket = dgram.createSocket('udp4');
    const cookie = `vsp${Date.now()}`;
    const message = Buffer.from(`${cookie} d4:ping0:e`);
    let settled = false;

    const finish = (status: 'up' | 'down', detail?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.close();
      resolve({ status, latencyMs: Date.now() - started, detail });
    };

    const timer = setTimeout(() => finish('down', 'timeout'), timeoutMs);
    socket.once('message', () => finish('up'));
    socket.once('error', (err) => finish('down', err.message));
    socket.send(message, port, host, (err) => {
      if (err) finish('down', err.message);
    });
  });
}

/** Remediation P3 — shared TCP health probe. */
export function tcpProbe(host: string, port: number, timeoutMs = 1500): Promise<TcpProbeResult> {
  const started = Date.now();
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const finish = (status: 'up' | 'down', detail?: string) => {
      socket.destroy();
      resolve({ status, latencyMs: Date.now() - started, detail });
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish('up'));
    socket.once('timeout', () => finish('down', 'timeout'));
    socket.once('error', (err) => finish('down', err.message));
  });
}
