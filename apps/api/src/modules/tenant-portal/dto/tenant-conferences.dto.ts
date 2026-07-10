import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { ConferenceStatus, ConferenceType } from '@prisma/client';

export class CreateConferenceDto {
  @IsString()
  name!: string;

  @IsString()
  code!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(ConferenceType)
  conferenceType?: ConferenceType;

  @IsOptional()
  @IsString()
  pin?: string;

  @IsOptional()
  @IsString()
  moderatorPin?: string;

  @IsOptional()
  @IsBoolean()
  recordingEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  lobbyEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  waitingRoomEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(2)
  maxParticipants?: number;

  @IsOptional()
  @IsBoolean()
  lockRoom?: boolean;

  @IsOptional()
  @IsBoolean()
  muteOnJoin?: boolean;

  @IsOptional()
  @IsUUID()
  mohPlaylistId?: string;

  @IsOptional()
  @IsUUID()
  announcementId?: string;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @IsUUID()
  moderatorLineId?: string;

  @IsOptional()
  @IsEnum(ConferenceStatus)
  status?: ConferenceStatus;
}

export class UpdateConferenceDto {
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
  @IsEnum(ConferenceType)
  conferenceType?: ConferenceType;

  @IsOptional()
  @IsString()
  pin?: string;

  @IsOptional()
  @IsString()
  moderatorPin?: string;

  @IsOptional()
  @IsBoolean()
  recordingEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  lobbyEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  waitingRoomEnabled?: boolean;

  @IsOptional()
  @IsInt()
  maxParticipants?: number;

  @IsOptional()
  @IsBoolean()
  lockRoom?: boolean;

  @IsOptional()
  @IsBoolean()
  muteOnJoin?: boolean;

  @IsOptional()
  @IsUUID()
  mohPlaylistId?: string;

  @IsOptional()
  @IsUUID()
  announcementId?: string;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @IsUUID()
  moderatorLineId?: string;

  @IsOptional()
  @IsEnum(ConferenceStatus)
  status?: ConferenceStatus;
}

export class CloneConferenceDto {
  @IsString()
  name!: string;

  @IsString()
  code!: string;
}

export class ConferenceParticipantActionDto {
  @IsOptional()
  @IsBoolean()
  muted?: boolean;
}
