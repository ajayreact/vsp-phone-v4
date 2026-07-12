import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { getJwtUser, JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PERMISSIONS } from '../../enterprise-security/auth/permissions.constants';
import { PermissionsGuard, RequirePermission } from '../../enterprise-security/guards/permissions.guard';
import {
  CreateTenantDepartmentDto,
  CreateTenantSiteDto,
  UpdateTenantCompanyDto,
  UpdateTenantDepartmentDto,
  UpdateTenantSiteDto,
} from '../dto/tenant-organization.dto';
import { TenantOrganizationService } from '../services/tenant-organization.service';

@ApiTags('tenant-organization')
@ApiBearerAuth()
@Controller('v1/tenant/organization')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TenantOrganizationController {
  constructor(private readonly organization: TenantOrganizationService) {}

  @Get('company')
  @RequirePermission(PERMISSIONS.TENANT_SETTINGS_READ)
  @ApiOperation({ summary: 'Get tenant company profile' })
  async getCompany(@Req() req: Request) {
    const user = getJwtUser(req);
    const data = await this.organization.getCompany(user.tenantId);
    return { data };
  }

  @Patch('company')
  @RequirePermission(PERMISSIONS.TENANT_SETTINGS_WRITE)
  @ApiOperation({ summary: 'Update tenant company profile' })
  async updateCompany(@Body() dto: UpdateTenantCompanyDto, @Req() req: Request) {
    const user = getJwtUser(req);
    const data = await this.organization.updateCompany(user.tenantId, user.sub, dto);
    return { data };
  }

  @Get('sites')
  @RequirePermission(PERMISSIONS.TENANT_SETTINGS_READ)
  @ApiOperation({ summary: 'List tenant sites' })
  async listSites(@Query('search') search: string | undefined, @Req() req: Request) {
    const user = getJwtUser(req);
    const data = await this.organization.listSites(user.tenantId, search);
    return { data };
  }

  @Post('sites')
  @RequirePermission(PERMISSIONS.TENANT_SETTINGS_WRITE)
  @ApiOperation({ summary: 'Create tenant site' })
  async createSite(@Body() dto: CreateTenantSiteDto, @Req() req: Request) {
    const user = getJwtUser(req);
    const data = await this.organization.createSite(user.tenantId, user.sub, dto);
    return { data };
  }

  @Patch('sites/:id')
  @RequirePermission(PERMISSIONS.TENANT_SETTINGS_WRITE)
  @ApiOperation({ summary: 'Update tenant site' })
  async updateSite(@Param('id') id: string, @Body() dto: UpdateTenantSiteDto, @Req() req: Request) {
    const user = getJwtUser(req);
    const data = await this.organization.updateSite(user.tenantId, user.sub, id, dto);
    return { data };
  }

  @Delete('sites/:id')
  @RequirePermission(PERMISSIONS.TENANT_SETTINGS_WRITE)
  @ApiOperation({ summary: 'Delete tenant site' })
  async deleteSite(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    const data = await this.organization.deleteSite(user.tenantId, user.sub, id);
    return { data };
  }

  @Get('departments')
  @RequirePermission(PERMISSIONS.TENANT_USERS_READ)
  @ApiOperation({ summary: 'List tenant departments' })
  async listDepartments(@Query('search') search: string | undefined, @Req() req: Request) {
    const user = getJwtUser(req);
    const data = await this.organization.listDepartments(user.tenantId, search);
    return { data };
  }

  @Post('departments')
  @RequirePermission(PERMISSIONS.TENANT_USERS_WRITE)
  @ApiOperation({ summary: 'Create tenant department' })
  async createDepartment(@Body() dto: CreateTenantDepartmentDto, @Req() req: Request) {
    const user = getJwtUser(req);
    const data = await this.organization.createDepartment(user.tenantId, dto);
    return { data };
  }

  @Patch('departments/:id')
  @RequirePermission(PERMISSIONS.TENANT_USERS_WRITE)
  @ApiOperation({ summary: 'Update tenant department' })
  async updateDepartment(
    @Param('id') id: string,
    @Body() dto: UpdateTenantDepartmentDto,
    @Req() req: Request,
  ) {
    const user = getJwtUser(req);
    const data = await this.organization.updateDepartment(user.tenantId, id, dto);
    return { data };
  }

  @Delete('departments/:id')
  @RequirePermission(PERMISSIONS.TENANT_USERS_WRITE)
  @ApiOperation({ summary: 'Delete tenant department' })
  async deleteDepartment(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    const data = await this.organization.deleteDepartment(user.tenantId, id);
    return { data };
  }
}
