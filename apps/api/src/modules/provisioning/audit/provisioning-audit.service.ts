import { Injectable, Logger } from '@nestjs/common';
import { ProvisioningRedisService } from '../redis/provisioning-redis.service';

export type ProvisioningAuditEvent =
  | 'provisioning.enrolled'
  | 'provisioning.rendered'
  | 'provisioning.downloaded'
  | 'provisioning.quarantined'
  | 'provisioning.reprovision'
  | 'provisioning.rollback'
  | 'provisioning.assigned'
  | 'provisioning.status_sync';

@Injectable()
export class ProvisioningAuditService {
  private readonly logger = new Logger(ProvisioningAuditService.name);

  constructor(private readonly redis: ProvisioningRedisService) {}

  async log(event: ProvisioningAuditEvent, payload: Record<string, unknown>): Promise<void> {
    const entry = {
      event,
      ts: new Date().toISOString(),
      ...payload,
    };
    this.logger.log(JSON.stringify(entry));
    await this.redis.lpush(this.redis.auditStreamKey(), JSON.stringify(entry));
  }
}
