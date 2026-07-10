import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { RecordingPolicyMode } from '@prisma/client';

export class CreateRecordingPolicyDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsUUID()
  lineId?: string;

  @IsOptional()
  @IsUUID()
  queueId?: string;

  @IsOptional()
  @IsUUID()
  ivrId?: string;

  @IsOptional()
  @IsEnum(RecordingPolicyMode)
  policyMode?: RecordingPolicyMode;

  @IsOptional()
  @IsBoolean()
  recordingEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  recordInbound?: boolean;

  @IsOptional()
  @IsBoolean()
  recordOutbound?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  retentionDays?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  archiveAfterDays?: number;

  @IsOptional()
  @IsBoolean()
  legalHoldDefault?: boolean;

  @IsOptional()
  @IsBoolean()
  pauseAllowed?: boolean;
}

export class UpdateRecordingPolicyDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(RecordingPolicyMode)
  policyMode?: RecordingPolicyMode;

  @IsOptional()
  @IsBoolean()
  recordingEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  recordInbound?: boolean;

  @IsOptional()
  @IsBoolean()
  recordOutbound?: boolean;

  @IsOptional()
  @IsInt()
  retentionDays?: number;

  @IsOptional()
  @IsInt()
  archiveAfterDays?: number;

  @IsOptional()
  @IsBoolean()
  legalHoldDefault?: boolean;

  @IsOptional()
  @IsBoolean()
  pauseAllowed?: boolean;
}
