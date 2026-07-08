import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { TelecomServiceAuthGuard } from '../../../common/telecom/telecom-service-auth.guard';
import { BackupOrchestrationService } from '../backup/backup-orchestration.service';
import { KamailioPersistenceService } from '../backup/kamailio-persistence.service';
import { BackupDrService } from '../services/backup-dr.service';
import { HaHealthService } from '../health/ha-health.service';
import { ScalabilityReadinessService } from '../services/scalability-readiness.service';
import { ShutdownCoordinatorService } from '../services/shutdown-coordinator.service';

@ApiTags('enterprise-ha')
@ApiSecurity('telecom-service-auth')
@Controller('v1/ha')
@UseGuards(TelecomServiceAuthGuard)
export class HaController {
  constructor(
    private readonly readiness: ScalabilityReadinessService,
    private readonly haHealth: HaHealthService,
    private readonly backupDr: BackupDrService,
    private readonly backupOrchestration: BackupOrchestrationService,
    private readonly kamailioPersistenceSvc: KamailioPersistenceService,
    private readonly shutdown: ShutdownCoordinatorService,
  ) {}

  @Get('readiness')
  @ApiOperation({ summary: 'Scalability / HA readiness report (Phase 17)' })
  readinessReport() {
    return this.readiness.buildReport();
  }

  @Get('health')
  @ApiOperation({ summary: 'Extended HA health with cluster node status' })
  healthDetail() {
    return this.haHealth.checkAll();
  }

  @Get('shutdown')
  @ApiOperation({ summary: 'Graceful shutdown / drain status' })
  shutdownStatus() {
    return {
      draining: this.shutdown.isDraining(),
      inFlight: this.shutdown.inFlightCount(),
      ready: this.shutdown.isReady(),
    };
  }

  @Get('backup/status')
  @ApiOperation({ summary: 'Backup & disaster recovery status (Remediation C-02)' })
  backupStatus() {
    return this.backupOrchestration.getStatus();
  }

  @Post('backup/execute')
  @ApiOperation({ summary: 'Execute PostgreSQL backup hook + verification' })
  backupExecute() {
    return this.backupOrchestration.executeBackup();
  }

  @Post('backup/restore-readiness')
  @ApiOperation({ summary: 'Verify restore readiness (non-destructive)' })
  backupRestoreReadiness() {
    return this.backupOrchestration.verifyRestoreReadiness();
  }

  @Get('kamailio/persistence')
  @ApiOperation({ summary: 'Kamailio usrloc persistence report (Remediation H-06)' })
  getKamailioPersistence() {
    return this.kamailioPersistenceSvc.evaluate();
  }

  @Post('backup/config-snapshot')
  @ApiOperation({ summary: 'Export runtime configuration snapshot to Redis' })
  configSnapshot() {
    return this.backupDr.exportConfigSnapshot();
  }

  @Post('backup/restore-verify')
  @ApiOperation({ summary: 'Run restore verification hook (Redis marker)' })
  restoreVerify() {
    return this.backupDr.verifyRestoreHook();
  }
}
