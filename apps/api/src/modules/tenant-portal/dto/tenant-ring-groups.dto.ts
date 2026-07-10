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
import { QueueStatus, RingGroupStrategy, RouteDestinationType } from '@prisma/client';

export class CreateRingGroupDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  extension?: string;

  @IsOptional()
  @IsUUID()
  phoneNumberId?: string;

  @IsOptional()
  @IsEnum(RingGroupStrategy)
  strategy?: RingGroupStrategy;

  @IsOptional()
  @IsInt()
  @Min(5)
  timeoutSec?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  retryCount?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxCycles?: number;

  @IsOptional()
  @IsString()
  callerIdName?: string;

  @IsOptional()
  @IsUUID()
  recordingPolicyId?: string;

  @IsOptional()
  @IsUUID()
  voicemailLineId?: string;

  @IsOptional()
  @IsUUID()
  timeConditionId?: string;

  @IsOptional()
  @IsUUID()
  holidayCalendarId?: string;

  @IsOptional()
  @IsUUID()
  mohPlaylistId?: string;

  @IsOptional()
  @IsUUID()
  announcementId?: string;

  @IsOptional()
  @IsEnum(RouteDestinationType)
  overflowDestinationType?: RouteDestinationType;

  @IsOptional()
  @IsUUID()
  overflowDestinationId?: string;

  @IsOptional()
  @IsEnum(QueueStatus)
  status?: QueueStatus;
}

export class UpdateRingGroupDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  extension?: string;

  @IsOptional()
  @IsUUID()
  phoneNumberId?: string | null;

  @IsOptional()
  @IsEnum(RingGroupStrategy)
  strategy?: RingGroupStrategy;

  @IsOptional()
  @IsInt()
  @Min(5)
  timeoutSec?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  retryCount?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxCycles?: number;

  @IsOptional()
  @IsString()
  callerIdName?: string;

  @IsOptional()
  @IsUUID()
  recordingPolicyId?: string | null;

  @IsOptional()
  @IsUUID()
  voicemailLineId?: string | null;

  @IsOptional()
  @IsUUID()
  timeConditionId?: string | null;

  @IsOptional()
  @IsUUID()
  holidayCalendarId?: string | null;

  @IsOptional()
  @IsUUID()
  mohPlaylistId?: string | null;

  @IsOptional()
  @IsUUID()
  announcementId?: string | null;

  @IsOptional()
  @IsEnum(RouteDestinationType)
  overflowDestinationType?: RouteDestinationType | null;

  @IsOptional()
  @IsUUID()
  overflowDestinationId?: string | null;

  @IsOptional()
  @IsEnum(QueueStatus)
  status?: QueueStatus;
}

export class RingGroupMemberDto {
  @IsUUID()
  extensionId!: string;

  @IsOptional()
  @IsInt()
  priority?: number;

  @IsOptional()
  @IsInt()
  penalty?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  ringDelaySec?: number;

  @IsOptional()
  @IsInt()
  maxCalls?: number;

  @IsOptional()
  @IsBoolean()
  busySkip?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  wrapUpSec?: number;

  @IsOptional()
  @IsInt()
  memberOrder?: number;
}

export class BulkRingGroupMembersDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RingGroupMemberDto)
  members!: RingGroupMemberDto[];
}

export class BulkImportRingGroupRowDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(RingGroupStrategy)
  strategy?: RingGroupStrategy;

  @IsOptional()
  @IsInt()
  timeoutSec?: number;

  @IsOptional()
  @IsString()
  extension?: string;

  @IsOptional()
  @IsArray()
  memberExtensions?: string[];
}

export class BulkImportRingGroupsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkImportRingGroupRowDto)
  rows!: BulkImportRingGroupRowDto[];
}

export class CloneRingGroupDto {
  @IsString()
  name!: string;
}
