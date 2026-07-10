import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { getJwtUser, JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PERMISSIONS } from '../../enterprise-security/auth/permissions.constants';
import {
  PermissionsGuard,
  RequireAnyPermission,
  RequirePermission,
} from '../../enterprise-security/guards/permissions.guard';
import {
  BulkImportDialPlanRulesDto,
  CreateDialPlanRuleDto,
  TestDialPlanDto,
  UpdateDialPlanRuleDto,
} from '../dto/tenant-dial-plans.dto';
import { TenantDialPlansService } from '../services/tenant-dial-plans.service';

@ApiTags('tenant-dial-plans')
@ApiBearerAuth()
@Controller('v1/tenant/dial-plans')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TenantDialPlansController {
  constructor(private readonly dialPlans: TenantDialPlansService) {}

  @Get()
  @RequirePermission(PERMISSIONS.TENANT_ROUTING_READ)
  async list(@Req() req: Request) {
    const user = getJwtUser(req);
    const data = await this.dialPlans.list(user.tenantId);
    return { data };
  }

  @Get('export/json')
  @RequirePermission(PERMISSIONS.TENANT_ROUTING_READ)
  exportJson(@Req() req: Request) {
    const user = getJwtUser(req);
    return this.dialPlans.exportJson(user.tenantId);
  }

  @Get(':id')
  @RequirePermission(PERMISSIONS.TENANT_ROUTING_READ)
  getById(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.dialPlans.getById(user.tenantId, id);
  }

  @Post()
  @RequirePermission(PERMISSIONS.TENANT_ROUTING_WRITE)
  create(@Body() dto: CreateDialPlanRuleDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.dialPlans.create(user.tenantId, user.sub, dto);
  }

  @Post('bulk-import')
  @RequirePermission(PERMISSIONS.TENANT_ROUTING_WRITE)
  bulkImport(@Body() dto: BulkImportDialPlanRulesDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.dialPlans.bulkImport(user.tenantId, user.sub, dto);
  }

  @Post('test')
  @RequirePermission(PERMISSIONS.TENANT_ROUTING_READ)
  test(@Body() dto: TestDialPlanDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.dialPlans.test(user.tenantId, dto);
  }

  @Patch(':id')
  @RequirePermission(PERMISSIONS.TENANT_ROUTING_WRITE)
  update(@Param('id') id: string, @Body() dto: UpdateDialPlanRuleDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.dialPlans.update(user.tenantId, user.sub, id, dto);
  }

  @Delete(':id')
  @RequireAnyPermission(PERMISSIONS.TENANT_ROUTING_WRITE, PERMISSIONS.TENANT_ADMIN)
  remove(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.dialPlans.remove(user.tenantId, user.sub, id);
  }
}
