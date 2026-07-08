import { Injectable } from '@nestjs/common';
import { CallLifecycleState } from '@prisma/client';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import { TelecomRedisService } from '../../telecom/redis/telecom-redis.service';
import { MetricsRegistryService } from './metrics-registry.service';

/** Phase 15 — business metrics aggregation (Prometheus export). */
@Injectable()
export class MetricsService {
  private cpsWindow: number[] = [];

  constructor(
    private readonly registry: MetricsRegistryService,
    private readonly prisma: PrismaService,
    private readonly redis: TelecomRedisService,
  ) {}

  recordCallStarted(tenantId: string, intent: string): void {
    this.registry.incCounter('vsp_calls_started_total', { tenantId, intent });
    this.cpsWindow.push(Date.now());
    this.cpsWindow = this.cpsWindow.filter((t) => Date.now() - t < 60_000);
    this.registry.setGauge('vsp_calls_per_second', this.cpsWindow.length / 60, { tenantId });
  }

  recordCallCompleted(tenantId: string, durationSec: number, success: boolean): void {
    this.registry.incCounter('vsp_calls_completed_total', {
      tenantId,
      result: success ? 'success' : 'failed',
    });
    this.registry.observeHistogram('vsp_call_duration_seconds', durationSec, { tenantId });
    if (success) {
      this.registry.incCounter('vsp_calls_asr_total', { tenantId });
    }
  }

  recordRegistration(tenantId: string, success: boolean): void {
    this.registry.incCounter('vsp_registrations_total', {
      tenantId,
      result: success ? 'success' : 'failed',
    });
  }

  recordMediaSession(tenantId: string): void {
    this.registry.incCounter('vsp_rtpengine_sessions_total', { tenantId });
  }

  recordRecordingSession(tenantId: string): void {
    this.registry.incCounter('vsp_recording_sessions_total', { tenantId });
  }

  recordApiLatency(route: string, durationMs: number): void {
    this.registry.observeHistogram('vsp_api_latency_seconds', durationMs / 1000, { route });
  }

  recordRedisLatency(durationMs: number): void {
    this.registry.observeHistogram('vsp_redis_latency_seconds', durationMs / 1000);
  }

  recordPostgresLatency(durationMs: number): void {
    this.registry.observeHistogram('vsp_postgres_latency_seconds', durationMs / 1000);
  }

  async refreshGauges(): Promise<void> {
    if (!this.prisma.connected) return;
    const active = await this.prisma.callSession.count({
      where: {
        deletedAt: null,
        state: {
          in: [
            CallLifecycleState.DIALING,
            CallLifecycleState.RINGING,
            CallLifecycleState.ANSWERED,
            CallLifecycleState.ACTIVE,
            CallLifecycleState.HOLD,
            CallLifecycleState.PARK,
          ],
        },
      },
    });
    this.registry.setGauge('vsp_active_calls', active);

    const devices = await this.prisma.device.count({
      where: { deletedAt: null, status: { in: ['REGISTERED', 'ONLINE', 'BUSY'] } },
    });
    this.registry.setGauge('vsp_registered_devices', devices);

    const mem = process.memoryUsage();
    this.registry.setGauge('vsp_process_memory_bytes', mem.heapUsed);
    this.registry.setGauge('vsp_redis_available', this.redis.isAvailable() ? 1 : 0);
  }

  exportPrometheus(): string {
    return this.registry.renderPrometheus();
  }
}
