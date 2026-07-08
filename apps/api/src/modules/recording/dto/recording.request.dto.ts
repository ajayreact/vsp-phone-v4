import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { PresenceStatus } from '@prisma/client';

export class PatchLinePresenceRequestDto {
  @IsEnum(PresenceStatus)
  status!: PresenceStatus;

  @IsOptional()
  @IsString()
  customMessage?: string;
}

export class RecordingLifecycleRequestDto {
  @IsUUID()
  platformUuid!: string;

  @IsEnum(['started', 'stopped', 'completed', 'failed'])
  event!: 'started' | 'stopped' | 'completed' | 'failed';

  @IsOptional()
  @IsString()
  segmentId?: string;

  @IsOptional()
  @IsString()
  rtpSessionId?: string;

  @IsOptional()
  @IsString()
  localFilePath?: string;

  @IsOptional()
  durationSeconds?: number;

  @IsOptional()
  @IsString()
  mediaFormat?: string;

  @IsOptional()
  @IsString()
  errorCode?: string;
}

export class RecordingIntentRequestDto {
  @IsUUID()
  platformUuid!: string;

  @IsEnum(['pause', 'resume', 'stop'])
  action!: 'pause' | 'resume' | 'stop';

  @IsOptional()
  seq?: number;
}
