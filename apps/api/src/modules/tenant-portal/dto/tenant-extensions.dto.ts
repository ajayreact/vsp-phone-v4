import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
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
