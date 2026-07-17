import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { LineTelephonySettingsDto } from './tenant-lines.dto';

export class CreateExtensionDto {
  @ApiPropertyOptional({ description: 'Existing line UUID; omit when userId is provided to auto-provision a line' })
  @IsOptional()
  @IsUUID()
  lineId?: string;

  @ApiPropertyOptional({ description: 'User to assign when creating a new line' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  lineName?: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(16)
  extension!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  callerIdName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  emergencyCallerIdName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => LineTelephonySettingsDto)
  settings?: LineTelephonySettingsDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  displayName?: string;
}

export class RenameExtensionDisplayNameDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  displayName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  departmentId?: string;
}

export class UpdateExtensionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(16)
  extension?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  callerIdName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  phoneNumberId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  emergencyCallerIdName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => LineTelephonySettingsDto)
  settings?: LineTelephonySettingsDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  displayName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  inboundEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  outboundEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Enable/disable call recording for this line' })
  @IsOptional()
  @IsBoolean()
  recordingEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Enable/disable voicemail mailbox for this line' })
  @IsOptional()
  @IsBoolean()
  voicemailEnabled?: boolean;
}

export class BulkExtensionRowDto {
  @ApiProperty()
  @IsString()
  extension!: string;

  @ApiProperty()
  @IsUUID()
  userId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lineName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  callerIdName?: string;
}

export class BulkImportExtensionsDto {
  @ApiProperty({ type: [BulkExtensionRowDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkExtensionRowDto)
  rows!: BulkExtensionRowDto[];
}
