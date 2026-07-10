import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { AudioAssetCategory, MohPlayMode, MohScope } from '@prisma/client';

export class CreateAnnouncementDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(AudioAssetCategory)
  category?: AudioAssetCategory;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsString()
  mediaObjectKey?: string;

  @IsOptional()
  @IsString()
  ttsText?: string;

  @IsOptional()
  @IsString()
  ttsVoice?: string;

  @IsOptional()
  @IsBoolean()
  isEmergency?: boolean;

  @IsOptional()
  @IsArray()
  tags?: string[];
}

export class UpdateAnnouncementDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(AudioAssetCategory)
  category?: AudioAssetCategory;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsString()
  mediaObjectKey?: string;

  @IsOptional()
  @IsString()
  ttsText?: string;

  @IsOptional()
  @IsString()
  ttsVoice?: string;

  @IsOptional()
  @IsBoolean()
  isEmergency?: boolean;

  @IsOptional()
  @IsArray()
  tags?: string[];
}

export class ReplaceAnnouncementDto {
  @IsString()
  mediaObjectKey!: string;

  @IsOptional()
  @IsString()
  changeNotes?: string;
}

export class CreateMohPlaylistDto {
  @IsString()
  name!: string;

  @IsOptional()
  isDefault?: boolean;

  @IsOptional()
  @IsEnum(MohPlayMode)
  playMode?: MohPlayMode;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsString()
  streamingUrl?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;

  @IsOptional()
  @IsEnum(MohScope)
  scope?: MohScope;

  @IsOptional()
  @IsISO8601()
  scheduledFrom?: string;

  @IsOptional()
  @IsISO8601()
  scheduledTo?: string;
}

export class UpdateMohPlaylistDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  isDefault?: boolean;

  @IsOptional()
  @IsEnum(MohPlayMode)
  playMode?: MohPlayMode;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsString()
  streamingUrl?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;

  @IsOptional()
  @IsEnum(MohScope)
  scope?: MohScope;

  @IsOptional()
  @IsISO8601()
  scheduledFrom?: string | null;

  @IsOptional()
  @IsISO8601()
  scheduledTo?: string | null;

  @IsOptional()
  @IsString()
  changeNotes?: string;
}

export class CreateMohTrackDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsUUID()
  playlistId?: string;

  @IsString()
  mediaObjectKey!: string;

  @IsOptional()
  durationSec?: number;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsInt()
  trackPriority?: number;
}

export class ReorderMohTracksDto {
  @IsArray()
  @IsUUID(undefined, { each: true })
  trackIds!: string[];
}

export class PresignAudioUploadDto {
  @IsString()
  filename!: string;

  @IsOptional()
  @IsString()
  contentType?: string;
}
