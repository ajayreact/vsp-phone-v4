import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { TelecomServiceAuthGuard } from '../../../common/telecom/telecom-service-auth.guard';
import { BackupReadinessService } from '../backups/backup-readiness.service';
import { ConfigExportService } from '../configuration/config-export.service';
import { CicdReadinessService } from '../deployment/cicd-readiness.service';
import { DeploymentReadinessService } from '../deployment/deployment-readiness.service';
import { EnvironmentProfileService } from '../environment/environment-profile.service';
import { ReleaseInfoService } from '../releases/release-info.service';
import { RestoreValidationService } from '../restore/restore-validation.service';

@ApiTags('production-platform')
@ApiSecurity('telecom-service-auth')
@Controller('v1/production')
@UseGuards(TelecomServiceAuthGuard)
export class ProductionController {
  constructor(
    private readonly deployment: DeploymentReadinessService,
    private readonly release: ReleaseInfoService,
    private readonly configExport: ConfigExportService,
    private readonly restore: RestoreValidationService,
    private readonly backup: BackupReadinessService,
    private readonly cicd: CicdReadinessService,
    private readonly envProfile: EnvironmentProfileService,
  ) {}

  @Get('readiness')
  @ApiOperation({ summary: 'Production deployment readiness (Phase 18)' })
  readiness() {
    return this.deployment.buildReport();
  }

  @Get('version')
  @ApiOperation({ summary: 'Application release information (Phase 18)' })
  version() {
    return this.release.getVersionInfo();
  }

  @Get('environment')
  @ApiOperation({ summary: 'Active environment profile' })
  environment() {
    return this.envProfile.describe();
  }

  @Get('config/export')
  @ApiOperation({ summary: 'Export non-sensitive runtime configuration' })
  exportConfig() {
    return this.configExport.export();
  }

  @Post('restore/validate')
  @ApiOperation({ summary: 'Validate restore readiness (read-only)' })
  validateRestore() {
    return this.restore.validate();
  }

  @Get('backup/readiness')
  @ApiOperation({ summary: 'Backup readiness validation' })
  backupReadiness() {
    return this.backup.evaluate();
  }

  @Get('cicd/readiness')
  @ApiOperation({ summary: 'CI/CD deployment readiness report' })
  cicdReadiness() {
    return this.cicd.evaluate();
  }
}
