import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RecordingLifecycleResponseDto {
  @ApiProperty()
  accepted!: boolean;

  @ApiPropertyOptional()
  recordingId?: string;

  @ApiPropertyOptional()
  segmentId?: string;
}

export class RecordingIntentResponseDto {
  @ApiProperty()
  ok!: boolean;
}

export class RecordingListItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  publicId!: string;

  @ApiProperty()
  status!: string;

  @ApiPropertyOptional()
  mediaObjectKey?: string;

  @ApiPropertyOptional()
  durationSeconds?: number;

  @ApiPropertyOptional()
  startedAt?: string;

  @ApiPropertyOptional()
  endedAt?: string;
}

export class RecordingUrlResponseDto {
  @ApiPropertyOptional()
  url?: string;
}
