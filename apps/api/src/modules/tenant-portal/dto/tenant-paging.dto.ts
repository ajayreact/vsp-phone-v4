import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { IntercomMode, PagingGroupKind, PagingType } from '@prisma/client';

export class PagingMemberDto {
  @IsUUID()
  lineId!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;
}

export class CreatePagingGroupDto {
  @IsString()
  name!: string;

  @IsString()
  code!: string;

  @IsOptional()
  @IsEnum(PagingGroupKind)
  kind?: PagingGroupKind;

  @IsOptional()
  @IsEnum(PagingType)
  pagingType?: PagingType;

  @IsOptional()
  @IsString()
  zone?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  priorityLevel?: number;

  @IsOptional()
  @IsString()
  multicastAddress?: string;

  @IsOptional()
  @IsEnum(IntercomMode)
  intercomMode?: IntercomMode;

  @IsOptional()
  @IsBoolean()
  autoAnswer?: boolean;

  @IsOptional()
  @IsBoolean()
  whisperEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  pushToTalk?: boolean;

  @IsOptional()
  @IsUUID()
  targetLineId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PagingMemberDto)
  members?: PagingMemberDto[];
}

export class UpdatePagingGroupDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsEnum(PagingType)
  pagingType?: PagingType;

  @IsOptional()
  @IsString()
  zone?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  priorityLevel?: number;

  @IsOptional()
  @IsString()
  multicastAddress?: string | null;

  @IsOptional()
  @IsEnum(IntercomMode)
  intercomMode?: IntercomMode;

  @IsOptional()
  @IsBoolean()
  autoAnswer?: boolean;

  @IsOptional()
  @IsBoolean()
  whisperEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  pushToTalk?: boolean;

  @IsOptional()
  @IsUUID()
  targetLineId?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PagingMemberDto)
  members?: PagingMemberDto[];
}

export class BulkPagingMembersDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PagingMemberDto)
  members!: PagingMemberDto[];
}
