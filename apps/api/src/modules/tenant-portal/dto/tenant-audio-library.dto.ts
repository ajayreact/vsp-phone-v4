import { IsEnum, IsOptional, IsString } from 'class-validator';
import { AudioAssetCategory } from '@prisma/client';

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
}

export class CreateMohPlaylistDto {
  @IsString()
  name!: string;

  @IsOptional()
  isDefault?: boolean;
}

export class CreateMohTrackDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  playlistId?: string;

  @IsString()
  mediaObjectKey!: string;

  @IsOptional()
  durationSec?: number;
}

export class PresignAudioUploadDto {
  @IsString()
  filename!: string;

  @IsOptional()
  @IsString()
  contentType?: string;
}
