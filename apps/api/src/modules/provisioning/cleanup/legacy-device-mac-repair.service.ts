import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../telecom/prisma/prisma.service';
import { DeviceProvisioningCleanupService } from './device-provisioning-cleanup.service';

/** Runs once at API startup to release MACs left on soft-deleted device rows. */
@Injectable()
export class LegacyDeviceMacRepairService implements OnModuleInit {
  private readonly logger = new Logger(LegacyDeviceMacRepairService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cleanup: DeviceProvisioningCleanupService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.prisma.connected) return;

    try {
      const repaired = await this.cleanup.repairSoftDeletedDeviceMacBindings();
      if (repaired > 0) {
        this.logger.warn(JSON.stringify({ event: 'provisioning.mac.legacy_repair', repaired }));
      }
    } catch (err) {
      this.logger.error(
        `Legacy device MAC repair failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
