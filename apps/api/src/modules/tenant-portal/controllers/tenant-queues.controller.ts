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
  TenantQueuesService,
  type CreateQueueDto,
  type CreateQueueMemberDto,
  type UpdateQueueDto,
} from '../services/tenant-queues.service';

@ApiTags('tenant-queues')
@ApiBearerAuth()
@Controller('v1/tenant/queues')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TenantQueuesController {
  constructor(private readonly queues: TenantQueuesService) {}

  @Get()
  @RequirePermission(PERMISSIONS.TENANT_QUEUES_READ)
  @ApiOperation({ summary: 'List call queues' })
  async list(@Req() req: Request) {
    const user = getJwtUser(req);
    const data = await this.queues.list(user.tenantId);
    return { data };
  }

  @Post()
  @RequirePermission(PERMISSIONS.TENANT_QUEUES_WRITE)
  @ApiOperation({ summary: 'Create call queue' })
  create(@Body() dto: CreateQueueDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.queues.create(user.tenantId, user.sub, dto);
  }

  @Patch(':id')
  @RequirePermission(PERMISSIONS.TENANT_QUEUES_WRITE)
  @ApiOperation({ summary: 'Update call queue' })
  update(@Param('id') id: string, @Body() dto: UpdateQueueDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.queues.update(user.tenantId, user.sub, id, dto);
  }

  @Delete(':id')
  @RequireAnyPermission(PERMISSIONS.TENANT_QUEUES_WRITE, PERMISSIONS.TENANT_ADMIN)
  @ApiOperation({ summary: 'Soft-delete call queue' })
  remove(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.queues.remove(user.tenantId, user.sub, id);
  }

  @Get(':id/members')
  @RequirePermission(PERMISSIONS.TENANT_QUEUES_READ)
  @ApiOperation({ summary: 'List queue members' })
  async listMembers(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    const data = await this.queues.listMembers(user.tenantId, id);
    return { data };
  }

  @Post(':id/members')
  @RequirePermission(PERMISSIONS.TENANT_QUEUES_WRITE)
  @ApiOperation({ summary: 'Add queue member' })
  addMember(@Param('id') id: string, @Body() dto: CreateQueueMemberDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.queues.addMember(user.tenantId, user.sub, id, dto);
  }

  @Delete(':id/members/:memberId')
  @RequirePermission(PERMISSIONS.TENANT_QUEUES_WRITE)
  @ApiOperation({ summary: 'Remove queue member' })
  removeMember(
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @Req() req: Request,
  ) {
    const user = getJwtUser(req);
    return this.queues.removeMember(user.tenantId, user.sub, id, memberId);
  }
}
