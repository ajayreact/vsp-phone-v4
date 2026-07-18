import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class TenantLifecycleConfirmDto {
  @IsString()
  @MinLength(3)
  confirmPhrase!: string;

  @IsOptional()
  @IsBoolean()
  acknowledged?: boolean;
}

export class ResumeOnboardTenantDto {
  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  businessEmail?: string;

  @IsOptional()
  @IsString()
  businessPhone?: string;

  @IsOptional()
  @IsString()
  website?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsString()
  defaultLanguage?: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;

  @IsOptional()
  @IsString()
  siteName?: string;

  @IsOptional()
  @IsString()
  businessHours?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  emergencyNumber?: string;

  @IsOptional()
  @IsString()
  defaultCallerId?: string;

  @IsOptional()
  @IsString()
  holidayCalendar?: string;

  @IsOptional()
  @IsBoolean()
  requirePasswordChange?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  extensionCount?: number;

  @IsOptional()
  @IsString()
  extensionStart?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  selectedDidIds?: string[];

  @IsString()
  adminEmail!: string;

  @IsString()
  @MinLength(8)
  adminPassword!: string;

  @IsString()
  adminFirstName!: string;

  @IsString()
  adminLastName!: string;
}
