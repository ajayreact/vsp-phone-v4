import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';

/** Phase 17 — unique instance identity for horizontal scaling (sticky-session independent). */
@Injectable()
export class InstanceIdentityService {
  readonly instanceId: string;
  readonly hostname: string;
  readonly startedAt: string;

  constructor(private readonly config: ConfigService) {
    this.instanceId =
      (this.config.get<string>('INSTANCE_ID') ?? '').trim() || randomUUID();
    this.hostname = hostname();
    this.startedAt = new Date().toISOString();
  }

  describe(): Record<string, string> {
    return {
      instanceId: this.instanceId,
      hostname: this.hostname,
      startedAt: this.startedAt,
    };
  }
}
