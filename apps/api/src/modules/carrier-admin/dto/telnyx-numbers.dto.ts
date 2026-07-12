import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { parseQueryBoolean } from '../../../common/query-param.util';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ListTelnyxNumbersQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  region?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tag?: string;
}

export class PurchaseTelnyxNumberDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @ApiPropertyOptional({ default: 'US' })
  @IsOptional()
  @IsString()
  countryCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  region?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  connectionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  messagingProfileId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  voiceProfile?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  reservationId?: string;
}

export class UpdateTelnyxNumberDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  voiceProfile?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  messagingProfile?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  smsEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  emergencyEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  emergencyAddress?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cnam?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  connectionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}

export class AssignTelnyxNumberDto {
  @ApiProperty()
  @IsUUID()
  tenantId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  siteId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  department?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  extension?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ivr?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  queue?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ringGroup?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  voicemail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  conference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  forwardTo?: string;
}

export class BulkAssignTelnyxNumbersDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsUUID('4', { each: true })
  ids!: string[];

  @ApiProperty()
  @IsUUID()
  tenantId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  siteId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  extension?: string;

  @ApiPropertyOptional({ description: 'Starting extension for bulk mapping (auto-increments per sorted id)' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  startExtension?: string;

  @ApiPropertyOptional({ type: [String], description: 'Explicit extension per sorted id' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  extensions?: string[];
}

export class BulkReleaseTelnyxNumbersDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsUUID('4', { each: true })
  ids!: string[];
}

export class BulkPurchaseTelnyxNumbersDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  phoneNumbers!: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  connectionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  countryCode?: string;
}

export class BulkReserveTelnyxNumbersDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  phoneNumbers!: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  countryCode?: string;
}

export class BulkTagTelnyxNumbersDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsUUID('4', { each: true })
  ids!: string[];

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  tags!: string[];
}

export class BulkEmergencyUpdateDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsUUID('4', { each: true })
  ids!: string[];

  @ApiProperty()
  @IsString()
  emergencyAddress!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  emergencyEnabled?: boolean;
}

export class SearchAvailableNumbersQueryDto {
  @ApiPropertyOptional({ default: 'US' })
  @IsOptional()
  @IsString()
  countryCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  administrativeArea?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  locality?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  postalCode?: string;

  @ApiPropertyOptional({ description: 'Area code / NDC' })
  @IsOptional()
  @IsString()
  nationalDestinationCode?: string;

  @ApiPropertyOptional({ description: 'Area code alias for nationalDestinationCode' })
  @IsOptional()
  @IsString()
  areaCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  prefix?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contains?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  endsWith?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  startsWith?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  vanity?: string;

  @ApiPropertyOptional({ enum: ['local', 'toll_free', 'mobile', 'national'] })
  @IsOptional()
  @IsString()
  phoneNumberType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => parseQueryBoolean(value))
  voice?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => parseQueryBoolean(value))
  sms?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => parseQueryBoolean(value))
  mms?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => parseQueryBoolean(value))
  emergency?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => parseQueryBoolean(value))
  quickship?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => parseQueryBoolean(value))
  bestEffort?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(250)
  @Type(() => Number)
  limit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sort?: string;
}

export class ReserveTelnyxNumberDto {
  @ApiProperty()
  @IsString()
  phoneNumber!: string;

  @ApiPropertyOptional({ default: 'US' })
  @IsOptional()
  @IsString()
  countryCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  monthlyCost?: number;
}

export class ReviewNumberRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  internalNotes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['assign', 'purchase_then_assign'])
  action?: 'assign' | 'purchase_then_assign';
}

export class BulkReviewNumberRequestsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  ids!: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  internalNotes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['assign', 'purchase_then_assign'])
  action?: 'assign' | 'purchase_then_assign';
}

export class TelnyxNumberResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  number!: string;

  @ApiProperty()
  e164!: string;

  @ApiPropertyOptional()
  telnyxId?: string | null;

  @ApiPropertyOptional()
  connectionType?: string;

  @ApiPropertyOptional()
  connectionId?: string | null;

  @ApiPropertyOptional()
  voiceProfile?: string;

  @ApiPropertyOptional()
  messagingProfile?: string;

  @ApiProperty()
  smsEnabled!: boolean;

  @ApiProperty()
  mmsEnabled!: boolean;

  @ApiProperty()
  emergencyEnabled!: boolean;

  @ApiPropertyOptional()
  emergencyAddress?: string | null;

  @ApiPropertyOptional()
  cnam?: string | null;

  @ApiPropertyOptional()
  assignedTenantId?: string | null;

  @ApiPropertyOptional()
  assignedTenantName?: string | null;

  @ApiPropertyOptional()
  assignedSiteId?: string | null;

  @ApiPropertyOptional()
  assignedExtension?: string | null;

  @ApiPropertyOptional()
  assignedIvr?: string | null;

  @ApiPropertyOptional()
  assignedQueue?: string | null;

  @ApiPropertyOptional()
  assignedRingGroup?: string | null;

  @ApiPropertyOptional()
  assignedVoicemail?: string | null;

  @ApiPropertyOptional()
  assignedConference?: string | null;

  @ApiPropertyOptional()
  forwardTo?: string | null;

  @ApiProperty()
  region!: string;

  @ApiProperty()
  monthlyCost!: number;

  @ApiProperty()
  purchasedAt!: string;

  @ApiProperty()
  status!: string;

  @ApiPropertyOptional({ type: [String] })
  tags?: string[];

  @ApiPropertyOptional()
  notes?: string | null;

  @ApiPropertyOptional()
  regulatoryBundle?: string | null;
}

export class TelnyxDashboardDto {
  @ApiProperty()
  totalNumbers!: number;

  @ApiProperty()
  assigned!: number;

  @ApiProperty()
  available!: number;

  @ApiProperty()
  reserved!: number;

  @ApiProperty()
  pendingPort!: number;

  @ApiProperty()
  porting!: number;

  @ApiProperty()
  released!: number;

  @ApiProperty()
  smsEnabled!: number;

  @ApiProperty()
  voiceEnabled!: number;

  @ApiProperty()
  emergencyEnabled!: number;

  @ApiProperty()
  monthlyCost!: number;

  @ApiProperty()
  inventoryValue!: number;
}

export class TelnyxSyncStatusDto {
  @ApiProperty()
  lastSyncAt!: string | null;

  @ApiProperty()
  status!: string;

  @ApiPropertyOptional()
  lastError?: string | null;

  @ApiProperty()
  added!: number;

  @ApiProperty()
  updated!: number;

  @ApiProperty()
  failed!: number;

  @ApiProperty()
  conflicts!: number;
}
