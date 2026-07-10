import { IsArray, IsBoolean, IsEnum, IsInt, IsObject, IsOptional, IsString } from 'class-validator';
import { DialPlanRuleType } from '@prisma/client';

export class CreateDialPlanRuleDto {
  @IsString()
  name!: string;

  @IsEnum(DialPlanRuleType)
  ruleType!: DialPlanRuleType;

  @IsString()
  pattern!: string;

  @IsOptional()
  @IsString()
  replacement?: string;

  @IsOptional()
  @IsInt()
  priority?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateDialPlanRuleDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(DialPlanRuleType)
  ruleType?: DialPlanRuleType;

  @IsOptional()
  @IsString()
  pattern?: string;

  @IsOptional()
  @IsString()
  replacement?: string;

  @IsOptional()
  @IsInt()
  priority?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class BulkImportDialPlanRulesDto {
  @IsArray()
  rows!: Record<string, unknown>[];
}

export class TestDialPlanDto {
  @IsString()
  dialedNumber!: string;
}
