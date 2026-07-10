import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PERMISSIONS } from '../../enterprise-security/auth/permissions.constants';
import {
  PermissionsGuard,
  RequireAnyPermission,
} from '../../enterprise-security/guards/permissions.guard';
import { AdminRateLimitGuard } from '../../enterprise-security/guards/scoped-rate-limit.guards';
import { PlatformBillingService } from '../services/platform-billing.service';

@ApiTags('platform-billing')
@ApiBearerAuth()
@Controller('v1/platform/billing')
@UseGuards(JwtAuthGuard, PermissionsGuard, AdminRateLimitGuard)
export class PlatformBillingController {
  constructor(private readonly billing: PlatformBillingService) {}

  @Get('summary')
  @RequireAnyPermission(
    PERMISSIONS.PLATFORM_BILLING_READ,
    PERMISSIONS.PLATFORM_SUPER_ADMIN,
  )
  @ApiOperation({ summary: 'Platform billing summary' })
  async summary() {
    const data = await this.billing.summary();
    return { data };
  }

  @Get('plans')
  @RequireAnyPermission(
    PERMISSIONS.PLATFORM_BILLING_READ,
    PERMISSIONS.PLATFORM_SUPER_ADMIN,
  )
  @ApiOperation({ summary: 'List billing plans' })
  async plans() {
    const data = await this.billing.listPlans();
    return { data };
  }

  @Get('subscriptions')
  @RequireAnyPermission(
    PERMISSIONS.PLATFORM_BILLING_READ,
    PERMISSIONS.PLATFORM_SUPER_ADMIN,
  )
  @ApiOperation({ summary: 'List tenant subscriptions' })
  async subscriptions(@Query('tenantId') tenantId?: string) {
    const data = await this.billing.listSubscriptions(tenantId);
    return { data };
  }

  @Get('invoices')
  @RequireAnyPermission(
    PERMISSIONS.PLATFORM_BILLING_READ,
    PERMISSIONS.PLATFORM_SUPER_ADMIN,
  )
  @ApiOperation({ summary: 'List tenant invoices' })
  async invoices(@Query('tenantId') tenantId?: string) {
    const data = await this.billing.listInvoices(tenantId);
    return { data };
  }
}
