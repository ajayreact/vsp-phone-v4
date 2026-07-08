import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsObject, IsOptional, IsString } from 'class-validator';
import type { MigrationMappings, MigrationPayload } from '../types/migration.types';

export class MigrationValidateQueryDto {
  @ApiPropertyOptional({ description: 'Existing batch ID to re-validate' })
  @IsOptional()
  @IsString()
  batchId?: string;
}

export class MigrationImportDto implements MigrationPayload {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  batchLabel?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  @ApiPropertyOptional({ description: 'Enable Prisma production import (requires confirmation)' })
  @IsOptional()
  @IsBoolean()
  productionImport?: boolean;

  @ApiPropertyOptional({ description: 'Must be I_CONFIRM_PRODUCTION_IMPORT for production import' })
  @IsOptional()
  @IsString()
  productionImportConfirm?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  mappings?: MigrationMappings;

  @ApiPropertyOptional({ default: {} })
  @IsOptional()
  @IsObject()
  data: Partial<Record<string, Record<string, unknown>[]>> = {};
}
