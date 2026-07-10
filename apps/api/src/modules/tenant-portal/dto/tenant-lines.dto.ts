import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { CallForwardType } from '@prisma/client';

export class LineTelephonySettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  pin?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  callForwardEnabled?: boolean;

  @ApiPropertyOptional({ enum: CallForwardType })
  @IsOptional()
  @IsEnum(CallForwardType)
  callForwardType?: CallForwardType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  callForwardDestination?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  followMeEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  followMeDestinations?: unknown;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  findMeEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  findMeDestinations?: unknown;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  dndEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(320)
  voicemailNotifyEmail?: string;
}

export class CreateLineDto {
  @ApiProperty()
  @IsUUID()
  userId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  name!: string;

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
  settings?: LineTelephonySettingsDto;
}

export class UpdateLineDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  name?: string;

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
  settings?: LineTelephonySettingsDto;
}
