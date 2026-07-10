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
import {
  PermissionsGuard,
  RequireAnyPermission,
} from '../../enterprise-security/guards/permissions.guard';
import { AdminRateLimitGuard } from '../../enterprise-security/guards/scoped-rate-limit.guards';
import {
  AssignTelnyxNumberDto,
  BulkAssignTelnyxNumbersDto,
  BulkEmergencyUpdateDto,
  BulkPurchaseTelnyxNumbersDto,
  BulkReleaseTelnyxNumbersDto,
  BulkReserveTelnyxNumbersDto,
  BulkTagTelnyxNumbersDto,
  ListTelnyxNumbersQueryDto,
  PurchaseTelnyxNumberDto,
  ReserveTelnyxNumberDto,
  BulkReviewNumberRequestsDto,
  ReviewNumberRequestDto,
  SearchAvailableNumbersQueryDto,
  UpdateTelnyxNumberDto,
} from '../dto/telnyx-numbers.dto';
import { TelnyxMarketplaceReportsService } from '../services/telnyx-marketplace-reports.service';
import { TelnyxNumberRequestsService } from '../services/telnyx-number-requests.service';
import { TelnyxNumbersService } from '../services/telnyx-numbers.service';

const READ = [PERMISSIONS.PLATFORM_TELNYX_READ, PERMISSIONS.PLATFORM_SUPER_ADMIN];
const WRITE = [PERMISSIONS.PLATFORM_TELNYX_WRITE, PERMISSIONS.PLATFORM_SUPER_ADMIN];

@ApiTags('carriers-telnyx')
@ApiBearerAuth()
@Controller('v1/carriers/telnyx/numbers')
@UseGuards(JwtAuthGuard, PermissionsGuard, AdminRateLimitGuard)
export class TelnyxNumbersController {
  constructor(
    private readonly numbers: TelnyxNumbersService,
    private readonly requests: TelnyxNumberRequestsService,
    private readonly reports: TelnyxMarketplaceReportsService,
  ) {}

  @Get('dashboard')
  @RequireAnyPermission(...READ)
  @ApiOperation({ summary: 'Telnyx inventory dashboard metrics' })
  dashboard() {
    return this.numbers.getDashboard().then((data) => ({ data }));
  }

  @Get('sync/status')
  @RequireAnyPermission(...READ)
  @ApiOperation({ summary: 'Telnyx sync status' })
  syncStatus() {
    return this.numbers.getSyncStatus().then((data) => ({ data }));
  }

  @Post('sync')
  @RequireAnyPermission(...WRITE)
  @ApiOperation({ summary: 'Trigger manual Telnyx inventory sync' })
  sync(@Req() req: Request) {
    return this.numbers.triggerSync(getJwtUser(req).sub).then((data) => ({ data }));
  }

  @Get('search/available')
  @RequireAnyPermission(...READ)
  @ApiOperation({ summary: 'Search Telnyx available phone numbers' })
  searchAvailable(@Query() query: SearchAvailableNumbersQueryDto) {
    return this.numbers.searchAvailable(query).then((data) => ({ data }));
  }

  @Get('marketplace')
  @RequireAnyPermission(PERMISSIONS.TENANT_DIDS_READ, PERMISSIONS.TENANT_NUMBERS_REQUEST, ...READ)
  @ApiOperation({ summary: 'Platform inventory available for tenant marketplace' })
  marketplace(@Query('search') search?: string) {
    return this.numbers.listMarketplaceInventory(search).then((data) => ({ data }));
  }

  @Post('reserve')
  @RequireAnyPermission(...WRITE)
  @ApiOperation({ summary: 'Reserve a phone number for purchase' })
  reserve(@Body() dto: ReserveTelnyxNumberDto, @Req() req: Request) {
    return this.numbers.reserve(dto, getJwtUser(req).sub);
  }

  @Post('purchase')
  @RequireAnyPermission(...WRITE)
  @ApiOperation({ summary: 'Purchase a Telnyx phone number' })
  purchase(@Body() dto: PurchaseTelnyxNumberDto, @Req() req: Request) {
    return this.numbers.purchase(dto, getJwtUser(req).sub);
  }

  @Post('bulk/assign')
  @RequireAnyPermission(...WRITE)
  @ApiOperation({ summary: 'Bulk assign numbers to tenant' })
  bulkAssign(@Body() dto: BulkAssignTelnyxNumbersDto, @Req() req: Request) {
    return this.numbers.bulkAssign(dto, getJwtUser(req).sub);
  }

  @Post('bulk/release')
  @RequireAnyPermission(...WRITE)
  @ApiOperation({ summary: 'Bulk release numbers' })
  bulkRelease(@Body() dto: BulkReleaseTelnyxNumbersDto, @Req() req: Request) {
    return this.numbers.bulkRelease(dto, getJwtUser(req).sub);
  }

  @Post('bulk/purchase')
  @RequireAnyPermission(...WRITE)
  @ApiOperation({ summary: 'Bulk purchase numbers' })
  bulkPurchase(@Body() dto: BulkPurchaseTelnyxNumbersDto, @Req() req: Request) {
    return this.numbers.bulkPurchase(dto, getJwtUser(req).sub);
  }

  @Post('bulk/reserve')
  @RequireAnyPermission(...WRITE)
  @ApiOperation({ summary: 'Bulk reserve numbers' })
  bulkReserve(@Body() dto: BulkReserveTelnyxNumbersDto, @Req() req: Request) {
    return this.numbers.bulkReserve(dto, getJwtUser(req).sub);
  }

  @Post('bulk/tag')
  @RequireAnyPermission(...WRITE)
  @ApiOperation({ summary: 'Bulk tag numbers' })
  bulkTag(@Body() dto: BulkTagTelnyxNumbersDto, @Req() req: Request) {
    return this.numbers.bulkTag(dto, getJwtUser(req).sub).then((data) => ({ data }));
  }

  @Post('bulk/emergency')
  @RequireAnyPermission(...WRITE)
  @ApiOperation({ summary: 'Bulk update emergency address' })
  bulkEmergency(@Body() dto: BulkEmergencyUpdateDto, @Req() req: Request) {
    return this.numbers.bulkEmergencyUpdate(dto, getJwtUser(req).sub).then((data) => ({ data }));
  }

  @Get('reports/marketplace')
  @RequireAnyPermission(...READ)
  @ApiOperation({ summary: 'Platform number marketplace reports' })
  marketplaceReports() {
    return this.reports.getPlatformReports().then((data) => ({ data }));
  }

  @Get('requests')
  @RequireAnyPermission(...WRITE)
  @ApiOperation({ summary: 'Tenant number request approval queue' })
  listRequests(@Query('status') status?: string) {
    return this.requests.listPlatform(status).then((data) => ({ data }));
  }

  @Post('requests/bulk/approve')
  @RequireAnyPermission(...WRITE)
  @ApiOperation({ summary: 'Bulk approve tenant number requests' })
  bulkApproveRequests(@Body() dto: BulkReviewNumberRequestsDto, @Req() req: Request) {
    return this.requests.bulkApprove(dto.ids, getJwtUser(req).sub, dto);
  }

  @Post('requests/bulk/reject')
  @RequireAnyPermission(...WRITE)
  @ApiOperation({ summary: 'Bulk reject tenant number requests' })
  bulkRejectRequests(@Body() dto: BulkReviewNumberRequestsDto, @Req() req: Request) {
    return this.requests.bulkReject(dto.ids, getJwtUser(req).sub, dto.notes);
  }

  @Get('requests/:id/history')
  @RequireAnyPermission(...WRITE)
  @ApiOperation({ summary: 'Number request approval history' })
  requestHistory(@Param('id') id: string) {
    return this.requests.getHistory(id).then((data) => ({ data }));
  }

  @Get('requests/:id')
  @RequireAnyPermission(...WRITE)
  @ApiOperation({ summary: 'Get tenant number request detail' })
  getRequest(@Param('id') id: string) {
    return this.requests.getPlatform(id).then((data) => ({ data }));
  }

  @Post('requests/:id/approve')
  @RequireAnyPermission(...WRITE)
  @ApiOperation({ summary: 'Approve tenant number request' })
  approveRequest(@Param('id') id: string, @Body() dto: ReviewNumberRequestDto, @Req() req: Request) {
    return this.requests.approve(id, getJwtUser(req).sub, dto);
  }

  @Post('requests/:id/reject')
  @RequireAnyPermission(...WRITE)
  @ApiOperation({ summary: 'Reject tenant number request' })
  rejectRequest(@Param('id') id: string, @Body() dto: ReviewNumberRequestDto, @Req() req: Request) {
    return this.requests.reject(id, getJwtUser(req).sub, dto.notes, dto.internalNotes);
  }

  @Get()
  @RequireAnyPermission(...READ)
  @ApiOperation({ summary: 'List Telnyx phone number inventory' })
  list(@Query() query: ListTelnyxNumbersQueryDto) {
    return this.numbers.list(query).then((data) => ({ data }));
  }

  @Get(':id/history')
  @RequireAnyPermission(...READ)
  @ApiOperation({ summary: 'Get number assignment and audit history' })
  history(@Param('id') id: string) {
    return this.numbers.getHistory(id).then((data) => ({ data }));
  }

  @Get(':id')
  @RequireAnyPermission(...READ)
  @ApiOperation({ summary: 'Get Telnyx number detail' })
  get(@Param('id') id: string) {
    return this.numbers.getById(id).then((data) => ({ data }));
  }

  @Patch(':id')
  @RequireAnyPermission(...WRITE)
  @ApiOperation({ summary: 'Update Telnyx number settings' })
  update(@Param('id') id: string, @Body() dto: UpdateTelnyxNumberDto, @Req() req: Request) {
    return this.numbers.update(id, dto, getJwtUser(req).sub);
  }

  @Post(':id/assign')
  @RequireAnyPermission(...WRITE)
  @ApiOperation({ summary: 'Assign number to tenant / routing target' })
  assign(@Param('id') id: string, @Body() dto: AssignTelnyxNumberDto, @Req() req: Request) {
    return this.numbers.assign(id, dto, getJwtUser(req).sub);
  }

  @Post(':id/reassign')
  @RequireAnyPermission(...WRITE)
  @ApiOperation({ summary: 'Reassign number to new tenant / target' })
  reassign(@Param('id') id: string, @Body() dto: AssignTelnyxNumberDto, @Req() req: Request) {
    return this.numbers.reassign(id, dto, getJwtUser(req).sub);
  }

  @Post(':id/suspend')
  @RequireAnyPermission(...WRITE)
  @ApiOperation({ summary: 'Suspend number' })
  suspend(@Param('id') id: string, @Req() req: Request) {
    return this.numbers.suspend(id, getJwtUser(req).sub);
  }

  @Post(':id/activate')
  @RequireAnyPermission(...WRITE)
  @ApiOperation({ summary: 'Activate suspended number' })
  activate(@Param('id') id: string, @Req() req: Request) {
    return this.numbers.activate(id, getJwtUser(req).sub);
  }

  @Post(':id/release')
  @RequireAnyPermission(...WRITE)
  @ApiOperation({ summary: 'Release number back to carrier' })
  async release(@Param('id') id: string, @Req() req: Request) {
    await this.numbers.release(id, getJwtUser(req).sub);
    return { ok: true };
  }

  @Delete(':id')
  @RequireAnyPermission(...WRITE)
  @ApiOperation({ summary: 'Release / delete a Telnyx number' })
  async remove(@Param('id') id: string, @Req() req: Request) {
    await this.numbers.release(id, getJwtUser(req).sub);
    return { ok: true };
  }
}
