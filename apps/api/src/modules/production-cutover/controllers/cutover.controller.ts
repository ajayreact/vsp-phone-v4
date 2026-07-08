import {
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
  Header,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { getJwtUser } from '../../auth/jwt-auth.guard';
import { SuperAdminGuard } from '../../migration-toolkit/guards/super-admin.guard';
import { CutoverOrchestratorService } from '../services/cutover-orchestrator.service';

@ApiTags('production-cutover')
@ApiBearerAuth()
@Controller('v1/cutover')
@UseGuards(SuperAdminGuard)
export class CutoverController {
  constructor(private readonly orchestrator: CutoverOrchestratorService) {}

  @Get('status')
  @ApiOperation({ summary: 'Cutover monitoring status (Phase 20)' })
  status() {
    return this.orchestrator.getStatus();
  }

  @Get('readiness')
  @ApiOperation({ summary: 'Final production readiness gate (Phase 20)' })
  readiness(@Req() req: Request) {
    return this.orchestrator.getReadiness(getJwtUser(req));
  }

  @Post('smoke-test')
  @ApiOperation({ summary: 'Execute automated smoke test suite (Phase 20)' })
  smokeTest(@Req() req: Request) {
    return this.orchestrator.runSmokeTests(getJwtUser(req));
  }

  @Get('report')
  @ApiOperation({ summary: 'Cutover report (JSON default; ?format=csv)' })
  report(
    @Req() req: Request,
    @Query('batchId') batchId?: string,
    @Query('format') format?: 'json' | 'csv',
  ) {
    if (format === 'csv') {
      return this.orchestrator.getReport(getJwtUser(req), batchId, 'csv');
    }
    return this.orchestrator.getReport(getJwtUser(req), batchId, 'json');
  }

  @Get('rollback-plan')
  @ApiOperation({ summary: 'Rollback plan (non-destructive; Phase 20)' })
  @Header('Content-Type', 'application/json')
  rollbackPlan(@Req() req: Request, @Query('batchId') batchId?: string) {
    return this.orchestrator.getRollbackPlan(getJwtUser(req), batchId);
  }
}
