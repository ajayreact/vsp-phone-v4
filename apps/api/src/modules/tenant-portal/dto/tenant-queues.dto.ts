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
import {
  QueueCallbackStatus,
  QueueMemberStatus,
  QueueStatus,
  QueueStrategy,
  QueueType,
  RouteDestinationType,
} from '@prisma/client';

export class CreateQueueDto {
  @IsString()
  name!: string;

  @IsString()
  code!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(QueueType)
  queueType?: QueueType;

  @IsOptional()
  @IsEnum(QueueStrategy)
  strategy?: QueueStrategy;

  @IsOptional()
  @IsEnum(QueueStatus)
  status?: QueueStatus;

  @IsOptional()
  @IsInt()
  @Min(0)
  wrapUpSec?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  slaTargetSec?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxWaitSec?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxQueueLength?: number;

  @IsOptional()
  @IsEnum(RouteDestinationType)
  overflowDestinationType?: RouteDestinationType;

  @IsOptional()
  @IsUUID()
  overflowDestinationId?: string;

  @IsOptional()
  @IsUUID()
  overflowQueueId?: string;

  @IsOptional()
  @IsBoolean()
  callbackEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  scheduledCallbackEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  priorityCallbackEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  positionAnnouncementEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  estimatedWaitAnnouncementEnabled?: boolean;

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
  @IsUUID()
  recordingPolicyId?: string;
}

export class UpdateQueueDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(QueueType)
  queueType?: QueueType;

  @IsOptional()
  @IsEnum(QueueStrategy)
  strategy?: QueueStrategy;

  @IsOptional()
  @IsEnum(QueueStatus)
  status?: QueueStatus;

  @IsOptional()
  @IsInt()
  @Min(0)
  wrapUpSec?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  slaTargetSec?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxWaitSec?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxQueueLength?: number;

  @IsOptional()
  @IsEnum(RouteDestinationType)
  overflowDestinationType?: RouteDestinationType | null;

  @IsOptional()
  @IsUUID()
  overflowDestinationId?: string | null;

  @IsOptional()
  @IsUUID()
  overflowQueueId?: string | null;

  @IsOptional()
  @IsBoolean()
  callbackEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  scheduledCallbackEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  priorityCallbackEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  positionAnnouncementEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  estimatedWaitAnnouncementEnabled?: boolean;

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
  @IsUUID()
  recordingPolicyId?: string | null;
}

export class QueueMemberDto {
  @IsUUID()
  lineId!: string;

  @IsOptional()
  @IsInt()
  priority?: number;

  @IsOptional()
  @IsInt()
  penalty?: number;

  @IsOptional()
  @IsEnum(QueueMemberStatus)
  status?: QueueMemberStatus;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxConcurrentCalls?: number;

  @IsOptional()
  skills?: Record<string, unknown>;
}

export class BulkQueueMembersDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QueueMemberDto)
  members!: QueueMemberDto[];
}

export class AgentPauseDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

export class QueueStateDto {
  @IsOptional()
  @IsBoolean()
  paused?: boolean;

  @IsOptional()
  @IsBoolean()
  emergencyClosed?: boolean;

  @IsOptional()
  @IsUUID()
  overflowQueueId?: string | null;
}

export class CreateQueueCallbackDto {
  @IsString()
  phoneNumber!: string;

  @IsOptional()
  @IsString()
  callerName?: string;

  @IsOptional()
  @IsInt()
  priority?: number;

  @IsOptional()
  @IsString()
  scheduledAt?: string;
}

export class BulkImportQueueRowDto {
  @IsString()
  name!: string;

  @IsString()
  code!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(QueueType)
  queueType?: QueueType;

  @IsOptional()
  @IsEnum(QueueStrategy)
  strategy?: QueueStrategy;
}

export class BulkImportQueuesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkImportQueueRowDto)
  rows!: BulkImportQueueRowDto[];
}

export class CloneQueueDto {
  @IsString()
  name!: string;

  @IsString()
  code!: string;
}

export class BulkQueueIdsDto {
  @IsArray()
  @IsUUID('4', { each: true })
  queueIds!: string[];
}
