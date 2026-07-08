import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import net from 'node:net';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { HA_EVENTS } from '../events/ha.events';
import { parseHostList } from '../../../common/redis/redis-connection.factory';

export interface KamailioNode {
  id: string;
  host: string;
  port: number;
  status: 'up' | 'down' | 'unknown';
  latencyMs?: number;
  lastCheck?: string;
}

/** Phase 17 — Kamailio cluster node registry and selection (config unchanged). */
@Injectable()
export class KamailioNodeRegistryService implements OnModuleInit {
  private readonly logger = new Logger(KamailioNodeRegistryService.name);
  private nodes: KamailioNode[] = [];
  private roundRobin = 0;
  private monitorTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly events: EventEmitter2,
  ) {}

  onModuleInit(): void {
    this.nodes = this.loadNodes();
    const intervalMs = Number(this.config.get('KAMAILIO_HEALTH_INTERVAL_MS') ?? '30000');
    if (intervalMs > 0) {
      this.monitorTimer = setInterval(() => {
        void this.checkAll();
      }, intervalMs);
    }
    void this.checkAll();
  }

  onModuleDestroy(): void {
    if (this.monitorTimer) clearInterval(this.monitorTimer);
  }

  listNodes(): KamailioNode[] {
    return [...this.nodes];
  }

  selectNode(): KamailioNode | null {
    const available = this.nodes.filter((n) => n.status === 'up');
    if (available.length === 0) return this.nodes[0] ?? null;
    const node = available[this.roundRobin % available.length];
    this.roundRobin += 1;
    return node;
  }

  async checkAll(): Promise<KamailioNode[]> {
    await Promise.all(this.nodes.map((node) => this.checkNode(node)));
    return this.listNodes();
  }

  describeConfig(): Record<string, unknown> {
    return {
      nodeCount: this.nodes.length,
      nodes: this.nodes.map((n) => `${n.host}:${n.port}`),
      rpcEndpoints: this.config.get('KAMAILIO_RPC_ENDPOINTS'),
    };
  }

  private loadNodes(): KamailioNode[] {
    const nodesRaw = this.config.get<string>('KAMAILIO_NODES');
    const defaultPort = Number(this.config.get('KAMAILIO_HTTP_PORT') ?? '8880');
    const defaultHost = this.config.get<string>('KAMAILIO_HTTP_HOST') ?? 'localhost';

    const hosts = nodesRaw
      ? parseHostList(nodesRaw, defaultPort)
      : [{ host: defaultHost, port: defaultPort }];

    return hosts.map((h, idx) => ({
      id: `kamailio-${idx + 1}`,
      host: h.host,
      port: h.port,
      status: 'unknown' as const,
    }));
  }

  private async checkNode(node: KamailioNode): Promise<void> {
    const started = Date.now();
    const prev = node.status;
    const tcp = await this.tcpCheck(node.host, node.port);
    node.status = tcp.status;
    node.latencyMs = Date.now() - started;
    node.lastCheck = new Date().toISOString();

    if (prev === 'up' && node.status === 'down') {
      this.logger.warn(JSON.stringify({ event: 'ha.kamailio.node.down', node: node.id }));
      this.events.emit(HA_EVENTS.KAMAILIO_NODE_DOWN, { nodeId: node.id });
    } else if (prev !== 'up' && node.status === 'up') {
      this.events.emit(HA_EVENTS.KAMAILIO_NODE_UP, { nodeId: node.id });
    }
  }

  private tcpCheck(host: string, port: number, timeoutMs = 1500): Promise<{ status: 'up' | 'down' }> {
    return new Promise((resolve) => {
      const socket = net.connect({ host, port });
      const finish = (status: 'up' | 'down') => {
        socket.destroy();
        resolve({ status });
      };
      socket.setTimeout(timeoutMs);
      socket.once('connect', () => finish('up'));
      socket.once('timeout', () => finish('down'));
      socket.once('error', () => finish('down'));
    });
  }
}
