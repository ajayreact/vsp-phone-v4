import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PresenceStatus } from '@prisma/client';

export class PatchLinePresenceRequestDto {
  @IsEnum(PresenceStatus)
  status!: PresenceStatus;

  @IsOptional()
  @IsString()
  customMessage?: string;
}
