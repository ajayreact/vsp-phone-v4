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
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TenantStatus } from '@prisma/client';
import type { Request, Response } from 'express';
import { getJwtUser, JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PERMISSIONS } from '../../enterprise-security/auth/permissions.constants';
import {
  PermissionsGuard,
  RequireAnyPermission,
} from '../../enterprise-security/guards/permissions.guard';
import { AdminRateLimitGuard } from '../../enterprise-security/guards/scoped-rate-limit.guards';
import { PlatformAssetStorageService } from '../services/platform-asset-storage.service';
import {
  PlatformTenantsService,
  type CreateTenantDto,
  type OnboardTenantDto,
  type UpdateTenantDto,
} from '../services/platform-tenants.service';

@ApiTags('platform-tenants')
@ApiBearerAuth()
@Controller('v1/platform/tenants')
@UseGuards(JwtAuthGuard, PermissionsGuard, AdminRateLimitGuard)
export class PlatformTenantsController {
  constructor(
    private readonly tenants: PlatformTenantsService,
    private readonly assets: PlatformAssetStorageService,
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
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024 } }))
  async uploadLogo(@UploadedFile() file?: { buffer: Buffer; mimetype: string; originalname: string; size: number }) {
    if (!file) {
      throw new BadRequestException('Logo file is required');
    }
    const data = await this.assets.uploadTenantLogo(file);
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

  @Delete(':id')
  @RequireAnyPermission(
    PERMISSIONS.PLATFORM_TENANTS_DELETE,
    PERMISSIONS.PLATFORM_SUPER_ADMIN,
  )
  @ApiOperation({ summary: 'Soft-delete tenant' })
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
