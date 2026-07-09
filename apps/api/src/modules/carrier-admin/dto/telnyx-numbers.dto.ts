import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

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
}

export class PurchaseTelnyxNumberDto {
  @ApiPropertyOptional({ description: 'E.164 number to purchase when known' })
  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @ApiPropertyOptional({ default: 'US' })
  @IsOptional()
  @IsString()
  countryCode?: string;

  @ApiPropertyOptional({ description: 'State/region code for local number search' })
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
  voiceProfile?: string;
}

export class UpdateTelnyxNumberDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  voiceProfile?: string;

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
  connectionId?: string;
}

export class AssignTelnyxNumberDto {
  @ApiProperty()
  @IsUUID()
  tenantId!: string;

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
  @IsString()
  extension?: string;
}

export class BulkReleaseTelnyxNumbersDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsUUID('4', { each: true })
  ids!: string[];
}

export class TelnyxNumberResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  number!: string;

  @ApiProperty()
  e164!: string;

  @ApiPropertyOptional()
  connectionType?: string;

  @ApiPropertyOptional()
  voiceProfile?: string;

  @ApiProperty()
  smsEnabled!: boolean;

  @ApiProperty()
  mmsEnabled!: boolean;

  @ApiProperty()
  emergencyEnabled!: boolean;

  @ApiPropertyOptional()
  assignedTenantId?: string | null;

  @ApiPropertyOptional()
  assignedTenantName?: string | null;

  @ApiPropertyOptional()
  assignedExtension?: string | null;

  @ApiPropertyOptional()
  assignedIvr?: string | null;

  @ApiPropertyOptional()
  assignedQueue?: string | null;

  @ApiProperty()
  region!: string;

  @ApiProperty()
  monthlyCost!: number;

  @ApiProperty()
  purchasedAt!: string;

  @ApiProperty()
  status!: string;
}
