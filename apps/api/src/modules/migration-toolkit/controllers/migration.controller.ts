import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  Header,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { MigrationImportDto, MigrationValidateQueryDto } from '../dto/migration.dto';
import { SuperAdminGuard } from '../guards/super-admin.guard';
import { MigrationOrchestratorService } from '../services/migration-orchestrator.service';
import { MigrationReportService } from '../reports/migration-report.service';
import { getJwtUser } from '../../auth/jwt-auth.guard';

@ApiTags('migration-toolkit')
@ApiBearerAuth()
@Controller('v1/migration')
@UseGuards(SuperAdminGuard)
export class MigrationController {
  constructor(
    private readonly orchestrator: MigrationOrchestratorService,
    private readonly reports: MigrationReportService,
  ) {}

  @Get('validate')
  @ApiOperation({ summary: 'Validate migration readiness and optional batch payload (Phase 19)' })
  validate(@Query() query: MigrationValidateQueryDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.orchestrator.validatePlatform(query.batchId, user);
  }

  @Post('dry-run')
  @ApiOperation({ summary: 'Dry-run migration validation (no data imported)' })
  dryRun(@Body() dto: MigrationImportDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.orchestrator.dryRun(dto, user);
  }

  @Post('import')
  @ApiOperation({ summary: 'Import migration batch (Redis staging; no Prisma writes)' })
  importBatch(@Body() dto: MigrationImportDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.orchestrator.import(dto, user);
  }

  @Get('report/:batchId')
  @ApiOperation({ summary: 'Migration report (JSON default)' })
  report(
    @Param('batchId') batchId: string,
    @Query('format') format?: 'json' | 'csv',
  ) {
    if (format === 'csv') {
      return this.reports.exportCsv(batchId);
    }
    return this.reports.exportJson(batchId);
  }

  @Get('verification/:batchId')
  @ApiOperation({ summary: 'Post-import verification report' })
  verification(@Param('batchId') batchId: string) {
    return this.orchestrator.getVerification(batchId);
  }

  @Get('rollback/:batchId')
  @ApiOperation({ summary: 'Rollback metadata report (non-destructive)' })
  @Header('Content-Type', 'application/json')
  rollback(@Param('batchId') batchId: string) {
    return this.orchestrator.getRollbackMetadata(batchId);
  }
}
