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
  BulkNumberRequestDto,
  CreateNumberRequestDto,
  CreateSavedSearchDto,
  FavoriteNumberDto,
  MarketplaceSearchQueryDto,
  ReserveMarketplaceNumberDto,
} from '../dto/tenant-marketplace.dto';
import { TenantMarketplaceService } from '../services/tenant-marketplace.service';
import { NumberNotificationsService } from '../../carrier-admin/services/number-notifications.service';
import { TenantNumberRequestsService } from '../services/tenant-number-requests.service';

@ApiTags('tenant-marketplace')
@ApiBearerAuth()
@Controller('v1/tenant/marketplace')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TenantMarketplaceController {
  constructor(
    private readonly marketplace: TenantMarketplaceService,
    private readonly requests: TenantNumberRequestsService,
    private readonly notifications: NumberNotificationsService,
  ) {}

  @Get('dashboard')
  @RequirePermission(PERMISSIONS.TENANT_DIDS_READ)
  @ApiOperation({ summary: 'Tenant number marketplace dashboard' })
  dashboard(@Req() req: Request) {
    const user = getJwtUser(req);
    return this.marketplace.getDashboard(user.tenantId).then((data) => ({ data }));
  }

  @Get('inventory')
  @RequirePermission(PERMISSIONS.TENANT_DIDS_READ)
  @ApiOperation({ summary: 'Search platform number inventory' })
  inventory(@Query() query: MarketplaceSearchQueryDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.marketplace.searchInventory(user.tenantId, user.sub, query).then((data) => ({ data }));
  }

  @Post('reserve')
  @RequirePermission(PERMISSIONS.TENANT_NUMBERS_REQUEST)
  @ApiOperation({ summary: 'Reserve a platform number temporarily' })
  reserve(@Body() dto: ReserveMarketplaceNumberDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.marketplace.reserve(user.tenantId, user.sub, dto.phoneNumber, dto.countryCode);
  }

  @Delete('reservations/:id')
  @RequirePermission(PERMISSIONS.TENANT_NUMBERS_REQUEST)
  @ApiOperation({ summary: 'Cancel a number reservation' })
  cancelReservation(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.marketplace.cancelReservation(user.tenantId, user.sub, id);
  }

  @Get('favorites')
  @RequirePermission(PERMISSIONS.TENANT_DIDS_READ)
  favorites(@Req() req: Request) {
    const user = getJwtUser(req);
    return this.marketplace.listFavorites(user.tenantId, user.sub).then((data) => ({ data }));
  }

  @Post('favorites')
  @RequirePermission(PERMISSIONS.TENANT_NUMBERS_REQUEST)
  addFavorite(@Body() dto: FavoriteNumberDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.marketplace.addFavorite(user.tenantId, user.sub, dto.phoneNumber);
  }

  @Delete('favorites/:phoneNumber')
  @RequirePermission(PERMISSIONS.TENANT_NUMBERS_REQUEST)
  removeFavorite(@Param('phoneNumber') phoneNumber: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.marketplace.removeFavorite(user.tenantId, user.sub, decodeURIComponent(phoneNumber));
  }

  @Get('saved-searches')
  @RequirePermission(PERMISSIONS.TENANT_DIDS_READ)
  savedSearches(@Req() req: Request) {
    const user = getJwtUser(req);
    return this.marketplace.listSavedSearches(user.tenantId, user.sub).then((data) => ({ data }));
  }

  @Post('saved-searches')
  @RequirePermission(PERMISSIONS.TENANT_DIDS_READ)
  createSavedSearch(@Body() dto: CreateSavedSearchDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.marketplace.createSavedSearch(user.tenantId, user.sub, dto.name, dto.filters);
  }

  @Delete('saved-searches/:id')
  @RequirePermission(PERMISSIONS.TENANT_DIDS_READ)
  deleteSavedSearch(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.marketplace.deleteSavedSearch(user.tenantId, user.sub, id);
  }

  @Get('recently-assigned')
  @RequirePermission(PERMISSIONS.TENANT_DIDS_READ)
  recentlyAssigned(@Req() req: Request) {
    const user = getJwtUser(req);
    return this.marketplace.getRecentlyAssigned(user.tenantId).then((data) => ({ data }));
  }

  @Get('notifications')
  @RequirePermission(PERMISSIONS.TENANT_DIDS_READ)
  listNotifications(@Query('unreadOnly') unreadOnly: string | undefined, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.notifications
      .list(user.tenantId, user.sub, unreadOnly === 'true')
      .then((data) => ({ data }));
  }

  @Patch('notifications/:id/read')
  @RequirePermission(PERMISSIONS.TENANT_DIDS_READ)
  markNotificationRead(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.notifications.markRead(user.tenantId, id).then((data) => ({ data }));
  }

  @Patch('notifications/read-all')
  @RequirePermission(PERMISSIONS.TENANT_DIDS_READ)
  markAllRead(@Req() req: Request) {
    const user = getJwtUser(req);
    return this.notifications.markAllRead(user.tenantId, user.sub).then((count) => ({ count }));
  }
}

@ApiTags('tenant-number-requests')
@ApiBearerAuth()
@Controller('v1/tenant/number-requests')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TenantNumberRequestsController {
  constructor(private readonly numberRequests: TenantNumberRequestsService) {}

  @Get()
  @RequirePermission(PERMISSIONS.TENANT_DIDS_READ)
  @ApiOperation({ summary: 'List number requests' })
  async list(@Query('status') status: string | undefined, @Req() req: Request) {
    const user = getJwtUser(req);
    const data = await this.numberRequests.list(user.tenantId, status);
    return { data };
  }

  @Get(':id')
  @RequirePermission(PERMISSIONS.TENANT_DIDS_READ)
  @ApiOperation({ summary: 'Get number request detail' })
  get(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.numberRequests.get(user.tenantId, id).then((data) => ({ data }));
  }

  @Post()
  @RequirePermission(PERMISSIONS.TENANT_NUMBERS_REQUEST)
  @ApiOperation({ summary: 'Submit a number request' })
  create(@Body() dto: CreateNumberRequestDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.numberRequests.create(user.tenantId, user.sub, dto);
  }

  @Post('bulk')
  @RequirePermission(PERMISSIONS.TENANT_NUMBERS_REQUEST)
  @ApiOperation({ summary: 'Submit bulk number requests' })
  bulkCreate(@Body() dto: BulkNumberRequestDto, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.numberRequests.bulkCreate(user.tenantId, user.sub, dto);
  }

  @Post(':id/cancel')
  @RequirePermission(PERMISSIONS.TENANT_NUMBERS_REQUEST)
  @ApiOperation({ summary: 'Cancel a pending number request' })
  cancel(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.numberRequests.cancel(user.tenantId, user.sub, id);
  }

  @Post(':id/withdraw')
  @RequirePermission(PERMISSIONS.TENANT_NUMBERS_REQUEST)
  @ApiOperation({ summary: 'Withdraw a pending number request' })
  withdraw(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.numberRequests.withdraw(user.tenantId, user.sub, id);
  }

  @Post(':id/duplicate')
  @RequirePermission(PERMISSIONS.TENANT_NUMBERS_REQUEST)
  @ApiOperation({ summary: 'Duplicate a number request' })
  duplicate(@Param('id') id: string, @Req() req: Request) {
    const user = getJwtUser(req);
    return this.numberRequests.duplicate(user.tenantId, user.sub, id);
  }
}
