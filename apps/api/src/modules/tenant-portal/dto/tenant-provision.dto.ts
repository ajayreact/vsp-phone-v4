import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';
import { RouteDestinationType } from '@prisma/client';

export class ProvisionSessionUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  firstName!: string;

  @IsString()
  lastName!: string;

  @IsOptional()
  @IsString()
  roleName?: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsUUID()
  siteId?: string;
}

export class ProvisionSessionExtensionDto {
  @IsString()
  extension!: string;

  @IsOptional()
  @IsString()
  lineName?: string;

  @IsOptional()
  @IsString()
  callerIdName?: string;
}

export class ProvisionSessionDeviceDto {
  @IsOptional()
  @IsBoolean()
  skip?: boolean;

  @IsOptional()
  @IsString()
  deviceType?: string;

  @IsOptional()
  @IsString()
  manufacturer?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  macAddress?: string;
}

export class ProvisionSessionDidDto {
  @IsOptional()
  @IsBoolean()
  skip?: boolean;

  @IsOptional()
  @IsUUID()
  phoneNumberId?: string;

  @IsOptional()
  @IsEnum(RouteDestinationType)
  destinationType?: RouteDestinationType;

  @IsOptional()
  @IsUUID()
  destinationId?: string;

  @IsOptional()
  @IsString()
  callerIdName?: string;
}

export class ProvisionSessionVoicemailDto {
  @IsOptional()
  @IsBoolean()
  skip?: boolean;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  notifyEmail?: string;
}
