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
import { RequirePermission, PermissionsGuard } from '../../enterprise-security/guards/permissions.guard';
import { AdminRateLimitGuard } from '../../enterprise-security/guards/scoped-rate-limit.guards';
import {
  AssignTelnyxNumberDto,
  BulkAssignTelnyxNumbersDto,
  BulkReleaseTelnyxNumbersDto,
  ListTelnyxNumbersQueryDto,
  PurchaseTelnyxNumberDto,
  ReserveTelnyxNumberDto,
  SearchAvailableNumbersQueryDto,
  UpdateTelnyxNumberDto,
} from '../dto/telnyx-numbers.dto';
import { TelnyxNumbersService } from '../services/telnyx-numbers.service';

@ApiTags('carriers-telnyx')
@ApiBearerAuth()
@Controller('v1/carriers/telnyx/numbers')
@UseGuards(JwtAuthGuard, PermissionsGuard, AdminRateLimitGuard)
export class TelnyxNumbersController {
  constructor(private readonly numbers: TelnyxNumbersService) {}

  @Get()
  @RequirePermission(PERMISSIONS.PLATFORM_SUPER_ADMIN)
  @ApiOperation({ summary: 'List Telnyx phone number inventory' })
  list(@Query() query: ListTelnyxNumbersQueryDto) {
    return this.numbers.list(query).then((data) => ({ data }));
  }

  @Post('purchase')
  @RequirePermission(PERMISSIONS.PLATFORM_SUPER_ADMIN)
  @ApiOperation({ summary: 'Purchase a Telnyx phone number' })
  purchase(@Body() dto: PurchaseTelnyxNumberDto, @Req() req: Request) {
    return this.numbers.purchase(dto, getJwtUser(req).sub);
  }

  @Patch(':id')
  @RequirePermission(PERMISSIONS.PLATFORM_SUPER_ADMIN)
  @ApiOperation({ summary: 'Update Telnyx number settings' })
  update(@Param('id') id: string, @Body() dto: UpdateTelnyxNumberDto, @Req() req: Request) {
    return this.numbers.update(id, dto, getJwtUser(req).sub);
  }

  @Delete(':id')
  @RequirePermission(PERMISSIONS.PLATFORM_SUPER_ADMIN)
  @ApiOperation({ summary: 'Release / delete a Telnyx number' })
  async remove(@Param('id') id: string, @Req() req: Request) {
    await this.numbers.release(id, getJwtUser(req).sub);
    return { ok: true };
  }

  @Post(':id/assign')
  @RequirePermission(PERMISSIONS.PLATFORM_SUPER_ADMIN)
  @ApiOperation({ summary: 'Assign number to tenant / extension / IVR / queue' })
  assign(@Param('id') id: string, @Body() dto: AssignTelnyxNumberDto, @Req() req: Request) {
    return this.numbers.assign(id, dto, getJwtUser(req).sub);
  }

  @Post(':id/release')
  @RequirePermission(PERMISSIONS.PLATFORM_SUPER_ADMIN)
  @ApiOperation({ summary: 'Release number back to carrier inventory' })
  async release(@Param('id') id: string, @Req() req: Request) {
    await this.numbers.release(id, getJwtUser(req).sub);
    return { ok: true };
  }

  @Post('bulk/assign')
  @RequirePermission(PERMISSIONS.PLATFORM_SUPER_ADMIN)
  @ApiOperation({ summary: 'Bulk assign numbers to tenant' })
  bulkAssign(@Body() dto: BulkAssignTelnyxNumbersDto, @Req() req: Request) {
    return this.numbers.bulkAssign(dto, getJwtUser(req).sub).then((data) => ({ data }));
  }

  @Post('bulk/release')
  @RequirePermission(PERMISSIONS.PLATFORM_SUPER_ADMIN)
  @ApiOperation({ summary: 'Bulk release numbers' })
  async bulkRelease(@Body() dto: BulkReleaseTelnyxNumbersDto, @Req() req: Request) {
    await this.numbers.bulkRelease(dto, getJwtUser(req).sub);
    return { ok: true };
  }

  @Get('search/available')
  @RequirePermission(PERMISSIONS.PLATFORM_SUPER_ADMIN)
  @ApiOperation({ summary: 'Search Telnyx available phone numbers' })
  searchAvailable(@Query() query: SearchAvailableNumbersQueryDto) {
    return this.numbers.searchAvailable(query).then((data) => ({ data }));
  }

  @Post('reserve')
  @RequirePermission(PERMISSIONS.PLATFORM_SUPER_ADMIN)
  @ApiOperation({ summary: 'Reserve a phone number for purchase' })
  reserve(@Body() dto: ReserveTelnyxNumberDto, @Req() req: Request) {
    return this.numbers.reserve(dto, getJwtUser(req).sub);
  }
}
