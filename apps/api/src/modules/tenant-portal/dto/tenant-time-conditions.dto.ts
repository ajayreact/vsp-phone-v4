import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TimeConditionScheduleType } from '@prisma/client';

export class TimeConditionRuleDto {
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  @IsString()
  startTime!: string;

  @IsString()
  endTime!: string;
}

export class CreateTimeConditionDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(TimeConditionScheduleType)
  scheduleType?: TimeConditionScheduleType;

  @IsString()
  timezone!: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TimeConditionRuleDto)
  rules?: TimeConditionRuleDto[];
}

export class UpdateTimeConditionDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(TimeConditionScheduleType)
  scheduleType?: TimeConditionScheduleType;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TimeConditionRuleDto)
  rules?: TimeConditionRuleDto[];
}

export class EvaluateTimeConditionDto {
  @IsOptional()
  @IsString()
  at?: string;
}
