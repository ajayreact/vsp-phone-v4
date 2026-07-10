import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { VoicemailGreetingType, VoicemailMailboxType, VoicemailStatus } from '@prisma/client';

export class CreateVoicemailDto {
  @IsOptional()
  @IsUUID()
  lineId?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(VoicemailMailboxType)
  mailboxType?: VoicemailMailboxType;

  @IsOptional()
  @IsString()
  mailboxNumber?: string;

  @IsOptional()
  @IsUUID()
  queueId?: string;

  @IsOptional()
  @IsUUID()
  ringGroupId?: string;

  @IsOptional()
  @IsUUID()
  conferenceId?: string;

  @IsOptional()
  @IsString()
  pin?: string;

  @IsOptional()
  @IsEnum(VoicemailStatus)
  status?: VoicemailStatus;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsString()
  emailNotify?: string;

  @IsOptional()
  @IsBoolean()
  emailAttach?: boolean;

  @IsOptional()
  @IsBoolean()
  emailDeleteAfter?: boolean;

  @IsOptional()
  @IsBoolean()
  transcriptionReady?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  storageQuotaMb?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  retentionDays?: number;
}

export class UpdateVoicemailDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(VoicemailMailboxType)
  mailboxType?: VoicemailMailboxType;

  @IsOptional()
  @IsString()
  mailboxNumber?: string;

  @IsOptional()
  @IsString()
  pin?: string;

  @IsOptional()
  @IsEnum(VoicemailStatus)
  status?: VoicemailStatus;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsString()
  emailNotify?: string;

  @IsOptional()
  @IsBoolean()
  emailAttach?: boolean;

  @IsOptional()
  @IsBoolean()
  emailDeleteAfter?: boolean;

  @IsOptional()
  @IsBoolean()
  transcriptionReady?: boolean;

  @IsOptional()
  @IsInt()
  storageQuotaMb?: number;

  @IsOptional()
  @IsInt()
  retentionDays?: number;
}

export class UpsertVoicemailGreetingDto {
  @IsEnum(VoicemailGreetingType)
  greetingType!: VoicemailGreetingType;

  @IsOptional()
  @IsString()
  mediaObjectKey?: string;

  @IsOptional()
  @IsString()
  ttsText?: string;
}

export class UpdateVoicemailMessageDto {
  @IsOptional()
  @IsBoolean()
  read?: boolean;

  @IsOptional()
  @IsBoolean()
  flagged?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class BulkVoicemailMessageIdsDto {
  @IsArray()
  @IsUUID(undefined, { each: true })
  ids!: string[];
}

export class SearchVoicemailMessagesDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsBoolean()
  unreadOnly?: boolean;

  @IsOptional()
  @IsBoolean()
  flaggedOnly?: boolean;
}
