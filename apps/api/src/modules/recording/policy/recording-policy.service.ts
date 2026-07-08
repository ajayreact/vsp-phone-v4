import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RouteRecordingDto } from '../../telecom/dto/telecom.response.dto';
import { PrismaService } from '../../telecom/prisma/prisma.service';

export type CallIntentForRecording = 'INTERNAL' | 'INBOUND' | 'OUTBOUND' | 'UNKNOWN' | 'DEFERRED';

/** Phase 12 — RecordingPolicy evaluation for Route Plan (ADR-029). */
@Injectable()
export class RecordingPolicyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async evaluateRouteRecording(params: {
    tenantId: string;
    fromLineId?: string;
    toLineId?: string;
    callIntent: CallIntentForRecording;
  }): Promise<RouteRecordingDto> {
    const killSwitch = (this.config.get<string>('RECORDING_ENABLED') ?? 'true').toLowerCase() === 'false';
    if (killSwitch || !this.prisma.connected) {
      return { enabled: false, pauseAllowed: false };
    }

    const lineIds = [params.fromLineId, params.toLineId].filter(Boolean) as string[];
    if (!lineIds.length) {
      return { enabled: false, pauseAllowed: false };
    }

    const policies = await this.prisma.recordingPolicy.findMany({
      where: {
        tenantId: params.tenantId,
        lineId: { in: lineIds },
        deletedAt: null,
        recordingEnabled: true,
      },
    });
    if (!policies.length) {
      return { enabled: false, pauseAllowed: false };
    }

    const byLine = new Map(policies.map((p) => [p.lineId, p]));
    const fromPolicy = params.fromLineId ? byLine.get(params.fromLineId) : undefined;
    const toPolicy = params.toLineId ? byLine.get(params.toLineId) : undefined;

    let enabled = false;
    let direction: RouteRecordingDto['direction'];

    switch (params.callIntent) {
      case 'OUTBOUND':
        enabled = Boolean(fromPolicy?.recordOutbound);
        direction = enabled ? 'caller' : undefined;
        break;
      case 'INBOUND':
        enabled = Boolean(toPolicy?.recordInbound);
        direction = enabled ? 'callee' : undefined;
        break;
      case 'INTERNAL':
        enabled = Boolean(fromPolicy || toPolicy);
        direction = enabled ? 'both' : undefined;
        break;
      default:
        enabled = policies.some((p) => p.recordInbound || p.recordOutbound);
        direction = enabled ? 'both' : undefined;
    }

    return {
      enabled,
      direction,
      pauseAllowed: enabled,
    };
  }
}
