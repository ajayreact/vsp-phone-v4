import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DeviceManufacturer, DeviceTemplateKind } from '@prisma/client';
import { BulkDeviceIdsDto } from './tenant-devices.dto';

export class EnrollDeviceDto {
  @IsString()
  @Matches(/^[a-fA-F0-9:-]{12,17}$/)
  mac!: string;

  @IsString()
  name!: string;

  @IsUUID()
  lineId!: string;

  @IsOptional()
  @IsEnum(DeviceManufacturer)
  manufacturer?: DeviceManufacturer;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  modelFamily?: string;

  @IsOptional()
  @IsUUID()
  siteId?: string;

  @IsOptional()
  @IsUUID()
  provisioningTemplateId?: string;

  @IsOptional()
  @IsIn(['stable', 'n-1', 'emergency'])
  firmwareChannel?: 'stable' | 'n-1' | 'emergency';
}

export class ReprovisionDeviceDto {
  @IsUUID()
  deviceId!: string;
}

export class RollbackDeviceConfigDto {
  @IsUUID()
  deviceId!: string;

  @IsInt()
  @Min(1)
  targetConfigVersion!: number;
}

export class CreateProvisioningTemplateDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(DeviceTemplateKind)
  templateKind?: DeviceTemplateKind;

  @IsEnum(DeviceManufacturer)
  manufacturer!: DeviceManufacturer;

  @IsOptional()
  @IsString()
  modelFamily?: string;

  @IsOptional()
  @IsString()
  firmwareChannel?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsObject()
  config!: Record<string, unknown>;
}

export class UpdateProvisioningTemplateDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(DeviceTemplateKind)
  templateKind?: DeviceTemplateKind;

  @IsOptional()
  @IsEnum(DeviceManufacturer)
  manufacturer?: DeviceManufacturer;

  @IsOptional()
  @IsString()
  modelFamily?: string;

  @IsOptional()
  @IsString()
  firmwareChannel?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

export class BulkProvisionDevicesDto {
  @IsArray()
  @IsUUID('4', { each: true })
  deviceIds!: string[];
}

export class ApproveFirmwareDto {
  @IsUUID()
  releaseId!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  rolloutPercent?: number;

  @IsOptional()
  @IsString()
  scheduledAt?: string;
}

export class BulkFirmwareUpdateDto extends BulkDeviceIdsDto {
  @IsUUID()
  releaseId!: string;
}

export class ScheduleFirmwareRolloutDto {
  @IsUUID()
  releaseId!: string;

  @IsInt()
  @Min(0)
  rolloutPercent!: number;

  @IsOptional()
  @IsString()
  scheduledAt?: string;
}
