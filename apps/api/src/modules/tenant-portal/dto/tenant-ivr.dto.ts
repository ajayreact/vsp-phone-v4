import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { IvrDestinationType, IvrFlowStatus, IvrStatus, RouteDestinationType } from '@prisma/client';

export class IvrFlowGraphDto {
  @IsArray()
  nodes!: Record<string, unknown>[];

  @IsArray()
  edges!: Record<string, unknown>[];

  @IsOptional()
  @IsObject()
  variables?: Record<string, unknown>;
}

export class CreateIvrDto {
  @IsString()
  name!: string;

  @IsString()
  code!: string;

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
  @IsString()
  language?: string;

  @IsOptional()
  @IsEnum(IvrStatus)
  status?: IvrStatus;

  @IsOptional()
  @IsUUID()
  greetingAnnouncementId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  timeoutSec?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  invalidRetries?: number;

  @IsOptional()
  @IsEnum(IvrDestinationType)
  invalidOptionDestinationType?: IvrDestinationType;

  @IsOptional()
  @IsUUID()
  invalidOptionDestinationId?: string;

  @IsOptional()
  @IsUUID()
  recordingPolicyId?: string;

  @IsOptional()
  @IsUUID()
  timeConditionId?: string;

  @IsOptional()
  @IsUUID()
  holidayCalendarId?: string;

  @IsOptional()
  @IsEnum(RouteDestinationType)
  failoverDestinationType?: RouteDestinationType;

  @IsOptional()
  @IsUUID()
  failoverDestinationId?: string;

  @IsOptional()
  @IsBoolean()
  emergencyOverrideEnabled?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => IvrFlowGraphDto)
  draftFlow?: IvrFlowGraphDto;
}

export class UpdateIvrDto {
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
  @IsString()
  extension?: string;

  @IsOptional()
  @IsUUID()
  phoneNumberId?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsEnum(IvrStatus)
  status?: IvrStatus;

  @IsOptional()
  @IsUUID()
  greetingAnnouncementId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  timeoutSec?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  invalidRetries?: number;

  @IsOptional()
  @IsEnum(IvrDestinationType)
  invalidOptionDestinationType?: IvrDestinationType;

  @IsOptional()
  @IsUUID()
  invalidOptionDestinationId?: string;

  @IsOptional()
  @IsUUID()
  recordingPolicyId?: string;

  @IsOptional()
  @IsUUID()
  timeConditionId?: string;

  @IsOptional()
  @IsUUID()
  holidayCalendarId?: string;

  @IsOptional()
  @IsEnum(RouteDestinationType)
  failoverDestinationType?: RouteDestinationType;

  @IsOptional()
  @IsUUID()
  failoverDestinationId?: string;

  @IsOptional()
  @IsBoolean()
  emergencyOverrideEnabled?: boolean;
}

export class SaveIvrDraftDto {
  @ValidateNested()
  @Type(() => IvrFlowGraphDto)
  flow!: IvrFlowGraphDto;
}

export class PublishIvrDto {
  @IsOptional()
  @IsString()
  changeNotes?: string;
}

export class CloneIvrDto {
  @IsString()
  name!: string;

  @IsString()
  code!: string;
}

export class SimulateIvrDto {
  @IsOptional()
  @IsString()
  startNodeId?: string;

  @IsOptional()
  @IsArray()
  digits?: string[];

  @IsOptional()
  @IsObject()
  variables?: Record<string, unknown>;
}

export class BulkImportIvrsDto {
  @IsArray()
  rows!: Record<string, unknown>[];
}
