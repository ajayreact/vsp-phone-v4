import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class SupervisorTenantQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  tenantId?: string;
}

export class SupervisorCallActionDto {
  @ApiProperty()
  @IsString()
  platformUuid!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  supervisorLineId?: string;
}

export class SupervisorTransferDto extends SupervisorCallActionDto {
  @ApiProperty()
  @IsString()
  target!: string;
}

export class SupervisorAgentActionDto {
  @ApiProperty()
  @IsUUID()
  lineId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  queueId?: string;
}

export class SupervisorQueueActionDto {
  @ApiProperty()
  @IsUUID()
  queueId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  overflowQueueId?: string;
}

export class RecordingSearchQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  to?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}

export class RecordingAnnotationDto {
  @ApiProperty({ enum: ['FLAG', 'COMMENT', 'BOOKMARK'] })
  @IsIn(['FLAG', 'COMMENT', 'BOOKMARK'])
  type!: 'FLAG' | 'COMMENT' | 'BOOKMARK';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  body?: string;
}

export class CoachingNoteDto {
  @ApiProperty()
  @IsUUID()
  callSessionId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  agentLineId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  qualityScore?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  agentScore?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  whisperUsed?: boolean;
}

export class BulkSupervisorActionDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  platformUuids!: string[];
}
