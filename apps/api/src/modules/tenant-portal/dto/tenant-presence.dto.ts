import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { PresenceStatus } from '@prisma/client';

export class SetLinePresenceDto {
  @IsEnum(PresenceStatus)
  status!: PresenceStatus;

  @IsOptional()
  @IsString()
  customMessage?: string;
}

export class SearchPresenceDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(PresenceStatus)
  status?: PresenceStatus;

  @IsOptional()
  @IsUUID()
  departmentId?: string;
}
