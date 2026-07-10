import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { RouteDestinationType } from '@prisma/client';

export class CreateInboundRouteDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUUID()
  phoneNumberId?: string;

  @IsOptional()
  @IsInt()
  priority?: number;

  @IsEnum(RouteDestinationType)
  destinationType!: RouteDestinationType;

  @IsOptional()
  @IsUUID()
  destinationLineId?: string;

  @IsOptional()
  @IsUUID()
  destinationQueueId?: string;

  @IsOptional()
  @IsUUID()
  destinationIvrId?: string;

  @IsOptional()
  @IsUUID()
  destinationRingGroupId?: string;

  @IsOptional()
  @IsUUID()
  timeConditionId?: string;

  @IsOptional()
  @IsUUID()
  holidayCalendarId?: string;

  @IsOptional()
  @IsEnum(RouteDestinationType)
  openHoursDestinationType?: RouteDestinationType;

  @IsOptional()
  @IsUUID()
  openHoursDestinationId?: string;

  @IsOptional()
  @IsEnum(RouteDestinationType)
  afterHoursDestinationType?: RouteDestinationType;

  @IsOptional()
  @IsUUID()
  afterHoursDestinationId?: string;

  @IsOptional()
  @IsEnum(RouteDestinationType)
  failoverDestinationType?: RouteDestinationType;

  @IsOptional()
  @IsUUID()
  failoverDestinationId?: string;

  @IsOptional()
  @IsString()
  externalDestination?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpdateInboundRouteDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUUID()
  phoneNumberId?: string;

  @IsOptional()
  @IsInt()
  priority?: number;

  @IsOptional()
  @IsEnum(RouteDestinationType)
  destinationType?: RouteDestinationType;

  @IsOptional()
  @IsUUID()
  destinationLineId?: string;

  @IsOptional()
  @IsUUID()
  destinationQueueId?: string;

  @IsOptional()
  @IsUUID()
  destinationIvrId?: string;

  @IsOptional()
  @IsUUID()
  destinationRingGroupId?: string;

  @IsOptional()
  @IsUUID()
  timeConditionId?: string;

  @IsOptional()
  @IsUUID()
  holidayCalendarId?: string;

  @IsOptional()
  @IsEnum(RouteDestinationType)
  openHoursDestinationType?: RouteDestinationType;

  @IsOptional()
  @IsUUID()
  openHoursDestinationId?: string;

  @IsOptional()
  @IsEnum(RouteDestinationType)
  afterHoursDestinationType?: RouteDestinationType;

  @IsOptional()
  @IsUUID()
  afterHoursDestinationId?: string;

  @IsOptional()
  @IsEnum(RouteDestinationType)
  failoverDestinationType?: RouteDestinationType;

  @IsOptional()
  @IsUUID()
  failoverDestinationId?: string;

  @IsOptional()
  @IsString()
  externalDestination?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class CreateOutboundRouteDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUUID()
  lineId?: string;

  @IsString()
  pattern!: string;

  @IsOptional()
  @IsString()
  prefix?: string;

  @IsOptional()
  @IsString()
  suffix?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  stripDigits?: number;

  @IsOptional()
  @IsString()
  callerIdPolicy?: string;

  @IsOptional()
  @IsUUID()
  carrierId?: string;

  @IsOptional()
  @IsUUID()
  failoverCarrierId?: string;

  @IsOptional()
  @IsInt()
  priority?: number;

  @IsOptional()
  @IsBoolean()
  emergencyRoute?: boolean;

  @IsOptional()
  @IsBoolean()
  internationalAllowed?: boolean;

  @IsOptional()
  @IsBoolean()
  normalizeE164?: boolean;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpdateOutboundRouteDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUUID()
  lineId?: string;

  @IsOptional()
  @IsString()
  pattern?: string;

  @IsOptional()
  @IsString()
  prefix?: string;

  @IsOptional()
  @IsString()
  suffix?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  stripDigits?: number;

  @IsOptional()
  @IsString()
  callerIdPolicy?: string;

  @IsOptional()
  @IsUUID()
  carrierId?: string;

  @IsOptional()
  @IsUUID()
  failoverCarrierId?: string;

  @IsOptional()
  @IsInt()
  priority?: number;

  @IsOptional()
  @IsBoolean()
  emergencyRoute?: boolean;

  @IsOptional()
  @IsBoolean()
  internationalAllowed?: boolean;

  @IsOptional()
  @IsBoolean()
  normalizeE164?: boolean;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class BulkImportInboundRoutesDto {
  @IsArray()
  rows!: Record<string, unknown>[];
}

export class BulkImportOutboundRoutesDto {
  @IsArray()
  rows!: Record<string, unknown>[];
}

export class TestRouteDto {
  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  @IsString()
  dialedNumber?: string;

  @IsOptional()
  @IsUUID()
  inboundRouteId?: string;
}
