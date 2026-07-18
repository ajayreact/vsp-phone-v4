import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantStatus } from '@prisma/client';
import type { Request, Response } from 'express';
import { AuthService } from '../../auth/auth.service';
import { ImpersonationStartResponseDto } from '../../auth/dto/auth.dto';
import { getJwtUser, JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PERMISSIONS } from '../../enterprise-security/auth/permissions.constants';
import {
  PermissionsGuard,
  RequireAnyPermission,
} from '../../enterprise-security/guards/permissions.guard';
import { AdminRateLimitGuard } from '../../enterprise-security/guards/scoped-rate-limit.guards';
import {
  ResumeOnboardTenantDto,
  TenantLifecycleConfirmDto,
} from '../dto/tenant-lifecycle.dto';
import { PlatformAssetStorageService } from '../services/platform-asset-storage.service';
import {
  PlatformTenantsService,
  type CreateTenantDto,
  type OnboardTenantDto,
  type UpdateTenantDto,
} from '../services/platform-tenants.service';
import { TenantResetService } from '../services/tenant-reset.service';

@ApiTags('platform-tenants')
@ApiBearerAuth()
@Controller('v1/platform/tenants')
@UseGuards(JwtAuthGuard, PermissionsGuard, AdminRateLimitGuard)
export class PlatformTenantsController {
  constructor(
    private readonly tenants: PlatformTenantsService,
    private readonly assets: PlatformAssetStorageService,
    private readonly auth: AuthService,
    private readonly lifecycle: TenantResetService,
  ) {}

  @Get()
  @RequireAnyPermission(
    PERMISSIONS.PLATFORM_TENANTS_READ,
    PERMISSIONS.PLATFORM_SUPER_ADMIN,
  )
  @ApiOperation({ summary: 'List platform tenants' })
  async list(
    @Query('search') search: string | undefined,
    @Query('status') status: TenantStatus | undefined,
  ) {
    const data = await this.tenants.list({ search, status });
    return { data };
  }

  @Post('onboard')
  @RequireAnyPermission(
    PERMISSIONS.PLATFORM_TENANTS_WRITE,
    PERMISSIONS.PLATFORM_SUPER_ADMIN,
  )
  @ApiOperation({ summary: 'Onboard tenant with admin user and RBAC seed' })
  async onboard(@Body() dto: OnboardTenantDto, @Req() req: Request) {
    const user = getJwtUser(req);
    const data = await this.tenants.onboard(dto, user.sub);
    return { data };
  }

  @Post('logo-upload')
  @RequireAnyPermission(
    PERMISSIONS.PLATFORM_TENANTS_WRITE,
    PERMISSIONS.PLATFORM_SUPER_ADMIN,
  )
  @ApiOperation({ summary: 'Upload tenant logo before onboarding' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 2 * 1024 * 1024 },
      storage: memoryStorage(),
    }),
  )
  async uploadLogo(@UploadedFile() file?: { buffer: Buffer; mimetype: string; originalname: string; size: number }) {
    if (!file) {
      throw new BadRequestException('Logo file is required');
    }
    const data = await this.assets.uploadTenantLogo(file);
    return { data };
  }

  @Get(':id/dids')
  @RequireAnyPermission(
    PERMISSIONS.PLATFORM_TENANTS_READ,
    PERMISSIONS.PLATFORM_SUPER_ADMIN,
  )
  @ApiOperation({ summary: 'List DIDs owned by tenant (for resume onboarding)' })
  async listDids(@Param('id') id: string) {
    const data = await this.tenants.listDids(id);
    return { data };
  }

  @Get(':id')
  @RequireAnyPermission(
    PERMISSIONS.PLATFORM_TENANTS_READ,
    PERMISSIONS.PLATFORM_SUPER_ADMIN,
  )
  @ApiOperation({ summary: 'Get tenant by id' })
  async get(@Param('id') id: string) {
    const data = await this.tenants.get(id);
    return { data };
  }

  @Post()
  @RequireAnyPermission(
    PERMISSIONS.PLATFORM_TENANTS_WRITE,
    PERMISSIONS.PLATFORM_SUPER_ADMIN,
  )
  @ApiOperation({ summary: 'Create tenant' })
  async create(@Body() dto: CreateTenantDto) {
    const data = await this.tenants.create(dto);
    return { data };
  }

  @Patch(':id')
  @RequireAnyPermission(
    PERMISSIONS.PLATFORM_TENANTS_WRITE,
    PERMISSIONS.PLATFORM_SUPER_ADMIN,
  )
  @ApiOperation({ summary: 'Update tenant' })
  async update(@Param('id') id: string, @Body() dto: UpdateTenantDto) {
    const data = await this.tenants.update(id, dto);
    return { data };
  }

  @Post(':id/suspend')
  @RequireAnyPermission(
    PERMISSIONS.PLATFORM_TENANTS_SUSPEND,
    PERMISSIONS.PLATFORM_SUPER_ADMIN,
  )
  @ApiOperation({ summary: 'Suspend tenant' })
  async suspend(@Param('id') id: string) {
    const data = await this.tenants.suspend(id);
    return { data };
  }

  @Post(':id/activate')
  @RequireAnyPermission(
    PERMISSIONS.PLATFORM_TENANTS_WRITE,
    PERMISSIONS.PLATFORM_SUPER_ADMIN,
  )
  @ApiOperation({ summary: 'Activate tenant' })
  async activate(@Param('id') id: string) {
    const data = await this.tenants.activate(id);
    return { data };
  }

  @Post(':id/impersonate')
  @RequireAnyPermission(
    PERMISSIONS.PLATFORM_TENANTS_WRITE,
    PERMISSIONS.PLATFORM_SUPER_ADMIN,
  )
  @ApiOperation({
    summary: 'Start tenant impersonation (one-time handoff for tenant portal)',
  })
  async impersonate(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    const data: ImpersonationStartResponseDto = await this.auth.startImpersonation(user, id);
    return { data };
  }

  @Post(':id/reset-pbx')
  @RequireAnyPermission(
    PERMISSIONS.PLATFORM_TENANTS_RESET,
    PERMISSIONS.PLATFORM_TENANTS_WRITE,
    PERMISSIONS.PLATFORM_SUPER_ADMIN,
  )
  @ApiOperation({ summary: 'Reset PBX ops data; keep users, org, DIDs owned by tenant' })
  async resetPbx(
    @Param('id') id: string,
    @Body() dto: TenantLifecycleConfirmDto,
    @Req() req: Request,
  ) {
    const user = getJwtUser(req);
    const data = await this.lifecycle.resetPbx(id, user.sub, dto);
    return { data };
  }

  @Post(':id/reset-tenant')
  @RequireAnyPermission(
    PERMISSIONS.PLATFORM_TENANTS_RESET,
    PERMISSIONS.PLATFORM_SUPER_ADMIN,
  )
  @ApiOperation({
    summary: 'Reset Tenant (Re-Onboarding): wipe identity/PBX, keep DIDs, status → PENDING',
  })
  async resetTenant(
    @Param('id') id: string,
    @Body() dto: TenantLifecycleConfirmDto,
    @Req() req: Request,
  ) {
    const user = getJwtUser(req);
    const data = await this.lifecycle.resetTenant(id, user.sub, dto);
    return { data };
  }

  @Post(':id/factory-reset')
  @RequireAnyPermission(
    PERMISSIONS.PLATFORM_TENANTS_RESET,
    PERMISSIONS.PLATFORM_SUPER_ADMIN,
  )
  @ApiOperation({
    summary: 'Deprecated alias for Reset Tenant (Re-Onboarding)',
    deprecated: true,
  })
  async factoryReset(
    @Param('id') id: string,
    @Body() dto: TenantLifecycleConfirmDto,
    @Req() req: Request,
  ) {
    const user = getJwtUser(req);
    const data = await this.lifecycle.resetTenant(id, user.sub, dto);
    return { data };
  }

  @Post(':id/delete')
  @RequireAnyPermission(
    PERMISSIONS.PLATFORM_TENANTS_DELETE,
    PERMISSIONS.PLATFORM_SUPER_ADMIN,
  )
  @ApiOperation({
    summary: 'Soft-delete tenant, disable users/API keys, release DIDs to platform inventory',
  })
  async deleteConfirmed(
    @Param('id') id: string,
    @Body() dto: TenantLifecycleConfirmDto,
    @Req() req: Request,
  ) {
    const user = getJwtUser(req);
    const data = await this.lifecycle.deleteTenant(id, user.sub, dto);
    return { data };
  }

  @Post(':id/resume-onboard')
  @RequireAnyPermission(
    PERMISSIONS.PLATFORM_TENANTS_WRITE,
    PERMISSIONS.PLATFORM_SUPER_ADMIN,
  )
  @ApiOperation({ summary: 'Complete onboarding for a PENDING tenant after factory reset' })
  async resumeOnboard(
    @Param('id') id: string,
    @Body() dto: ResumeOnboardTenantDto,
    @Req() req: Request,
  ) {
    const user = getJwtUser(req);
    const data = await this.tenants.resumeOnboard(id, dto, user.sub);
    return { data };
  }

  @Delete(':id')
  @RequireAnyPermission(
    PERMISSIONS.PLATFORM_TENANTS_DELETE,
    PERMISSIONS.PLATFORM_SUPER_ADMIN,
  )
  @ApiOperation({ summary: 'Legacy soft-delete (prefer POST :id/delete with confirmation)' })
  async remove(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    const data = await this.tenants.softDelete(id, user.sub);
    return { data };
  }
}

@ApiTags('platform-assets')
@ApiBearerAuth()
@Controller('v1/platform/assets')
@UseGuards(JwtAuthGuard, PermissionsGuard, AdminRateLimitGuard)
export class PlatformAssetsController {
  constructor(private readonly assets: PlatformAssetStorageService) {}

  @Get('tenant-logos/:filename')
  @RequireAnyPermission(
    PERMISSIONS.PLATFORM_TENANTS_READ,
    PERMISSIONS.PLATFORM_SUPER_ADMIN,
  )
  @ApiOperation({ summary: 'Stream uploaded tenant logo' })
  async getTenantLogo(@Param('filename') filename: string, @Res() res: Response) {
    const objectKey = `tenant-logos/${filename}`;
    const { stream, contentType } = await this.assets.resolveAssetStream(objectKey);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    stream.pipe(res);
  }
}
