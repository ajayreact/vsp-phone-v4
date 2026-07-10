import { IsArray, IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';

export class SearchRecordingsDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

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
  @IsString()
  category?: string;

  @IsOptional()
  @IsBoolean()
  bookmarkedOnly?: boolean;

  @IsOptional()
  @IsBoolean()
  legalHoldOnly?: boolean;

  @IsOptional()
  limit?: number;
}

export class UpdateRecordingDto {
  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsArray()
  tags?: string[];

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  bookmarked?: boolean;

  @IsOptional()
  @IsBoolean()
  legalHold?: boolean;
}

export class RecordingAnnotationDto {
  @IsString()
  type!: 'FLAG' | 'COMMENT' | 'BOOKMARK';

  @IsOptional()
  @IsString()
  body?: string;
}

export class BulkRecordingIdsDto {
  @IsArray()
  @IsUUID(undefined, { each: true })
  ids!: string[];
}
