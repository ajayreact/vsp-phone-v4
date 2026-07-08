import net from 'node:net';

export interface TcpProbeResult {
  status: 'up' | 'down';
  latencyMs?: number;
  detail?: string;
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
