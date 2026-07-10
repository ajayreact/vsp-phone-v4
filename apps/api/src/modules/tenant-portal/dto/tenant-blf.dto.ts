import { IsArray, IsEnum, IsInt, IsOptional, IsString, IsUUID, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { BlfKeyFunction } from '@prisma/client';

export class BlfPanelKeyDto {
  @IsInt()
  @Min(0)
  position!: number;

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsEnum(BlfKeyFunction)
  functionType?: BlfKeyFunction;

  @IsOptional()
  @IsUUID()
  watchedLineId?: string;

  @IsOptional()
  @IsString()
  speedDialValue?: string;
}

export class CreateBlfPanelDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  columns?: number;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsUUID()
  lineId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BlfPanelKeyDto)
  keys?: BlfPanelKeyDto[];
}

export class UpdateBlfPanelDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  columns?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BlfPanelKeyDto)
  keys?: BlfPanelKeyDto[];
}

export class ReorderBlfKeysDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BlfPanelKeyDto)
  keys!: BlfPanelKeyDto[];
}
