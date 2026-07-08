import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { TelecomServiceAuthGuard } from '../../common/telecom/telecom-service-auth.guard';
import { CarrierService } from './carrier.service';

@ApiTags('carrier')
@Controller('v1')
export class CarrierController {
  constructor(private readonly carriers: CarrierService) {}

  @Get('telecom/carrier/health')
  @UseGuards(TelecomServiceAuthGuard)
  @ApiOperation({ summary: 'Telnyx carrier health (adapter)' })
  health(@Query('tenantId') tenantId?: string) {
    return this.carriers.health(tenantId);
  }

  @Post('telecom/carrier/failover')
  @UseGuards(TelecomServiceAuthGuard)
  @ApiOperation({
    summary: 'Carrier failover hook — select next trunk after SIP 408/503',
  })
  async failover(
    @Body()
    body: {
      tenantId: string;
      fromLineId: string;
      destinationE164: string;
      failedCarrierId: string;
      failedCarrierCode: string;
      failedSipHost: string;
      cliE164?: string;
    },
  ) {
    const failed = {
      carrierId: body.failedCarrierId,
      carrierCode: body.failedCarrierCode,
      carrierType: 'TELNYX',
      tenantId: body.tenantId,
      dispatcherSet: 2,
      sipHost: body.failedSipHost,
      sipPort: 5060,
      transport: 'udp' as const,
      health: 'RED' as const,
      failoverEnabled: true,
    };
    const next = await this.carriers.selectFailoverTrunk(
      {
        tenantId: body.tenantId,
        fromLineId: body.fromLineId,
        destinationE164: body.destinationE164,
        cliE164: body.cliE164,
      },
      failed,
    );
    return { ok: Boolean(next), trunk: next };
  }

  @Post('webhooks/telnyx')
  @HttpCode(200)
  @ApiOperation({ summary: 'Telnyx webhook receiver (ADR-010 / TEL-CAR-001)' })
  @ApiHeader({ name: 'telnyx-signature-ed25519', required: false })
  @ApiHeader({ name: 'x-telnyx-signature', required: false })
  async telnyxWebhook(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: unknown,
    @Req() _req: Request,
  ) {
    const result = await this.carriers.handleWebhook(headers, body);
    return {
      accepted: result.accepted,
      eventId: result.event?.eventId,
      type: result.event?.type,
      platformUuid: result.event?.platformUuid,
    };
  }

  /** Alias per TEL-CAR-001 path style */
  @Post('webhooks/carriers/telnyx')
  @HttpCode(200)
  telnyxWebhookAlias(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    return this.telnyxWebhook(headers, body, req);
  }
}
