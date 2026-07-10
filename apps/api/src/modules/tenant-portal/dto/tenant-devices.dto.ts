import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DeviceManufacturer, DeviceType } from '@prisma/client';

export class CreateDeviceDto {
  @IsString()
  name!: string;

  @IsEnum(DeviceType)
  deviceType!: DeviceType;

  @IsOptional()
  @IsEnum(DeviceManufacturer)
  manufacturer?: DeviceManufacturer;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-fA-F0-9:-]{12,17}$/)
  macAddress?: string;

  @IsOptional()
  @IsUUID()
  lineId?: string;

  @IsOptional()
  @IsUUID()
  siteId?: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsUUID()
  provisioningTemplateId?: string;

  @IsOptional()
  @IsString()
  serialNumber?: string;

  @IsOptional()
  @IsString()
  assetTag?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  modelFamily?: string;

  @IsOptional()
  @IsIn(['stable', 'n-1', 'emergency'])
  firmwareChannel?: 'stable' | 'n-1' | 'emergency';

  @IsOptional()
  @IsString()
  transport?: string;

  @IsOptional()
  @IsBoolean()
  tlsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  srtpEnabled?: boolean;
}

export class UpdateDeviceDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(DeviceManufacturer)
  manufacturer?: DeviceManufacturer;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsUUID()
  siteId?: string | null;

  @IsOptional()
  @IsUUID()
  departmentId?: string | null;

  @IsOptional()
  @IsUUID()
  provisioningTemplateId?: string | null;

  @IsOptional()
  @IsString()
  serialNumber?: string;

  @IsOptional()
  @IsString()
  assetTag?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  firmwareVersion?: string;

  @IsOptional()
  @IsString()
  transport?: string;

  @IsOptional()
  @IsBoolean()
  tlsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  srtpEnabled?: boolean;
}

export class AssignDeviceDto {
  @IsUUID()
  lineId!: string;
}

export class BulkImportDeviceRowDto {
  @IsString()
  name!: string;

  @IsEnum(DeviceType)
  deviceType!: DeviceType;

  @IsOptional()
  @IsEnum(DeviceManufacturer)
  manufacturer?: DeviceManufacturer;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  macAddress?: string;

  @IsOptional()
  @IsString()
  extension?: string;

  @IsOptional()
  @IsString()
  serialNumber?: string;

  @IsOptional()
  @IsString()
  assetTag?: string;

  @IsOptional()
  @IsString()
  location?: string;
}

export class BulkImportDevicesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkImportDeviceRowDto)
  rows!: BulkImportDeviceRowDto[];
}

export class BulkDeviceIdsDto {
  @IsArray()
  @IsUUID('4', { each: true })
  deviceIds!: string[];
}

export class BulkAssignDevicesDto {
  @IsArray()
  @IsUUID('4', { each: true })
  deviceIds!: string[];

  @IsUUID()
  lineId!: string;
}

export class CloneDeviceDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-fA-F0-9:-]{12,17}$/)
  macAddress?: string;
}

export class MoveDeviceSiteDto {
  @IsUUID()
  siteId!: string;
}
