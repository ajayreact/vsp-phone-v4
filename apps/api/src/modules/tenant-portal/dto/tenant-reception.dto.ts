import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { PresenceStatus } from '@prisma/client';

export class CreateParkingLotDto {
  @IsString()
  name!: string;

  @IsString()
  code!: string;

  @IsOptional()
  slotStart?: number;

  @IsOptional()
  slotCount?: number;

  @IsOptional()
  timeoutSec?: number;

  @IsOptional()
  @IsString()
  overflowDestination?: string;
}

export class UpdateParkingLotDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  slotStart?: number;

  @IsOptional()
  slotCount?: number;

  @IsOptional()
  timeoutSec?: number;

  @IsOptional()
  @IsString()
  overflowDestination?: string;
}

export class ParkCallDto {
  @IsString()
  platformUuid!: string;

  @IsOptional()
  @IsString()
  slot?: string;

  @IsOptional()
  @IsUUID()
  operatorLineId?: string;

  @IsOptional()
  @IsUUID()
  parkingLotId?: string;
}

export class RetrieveParkedCallDto {
  @IsString()
  slot!: string;

  @IsOptional()
  @IsUUID()
  operatorLineId?: string;

  @IsOptional()
  @IsUUID()
  parkingLotId?: string;
}

export class PickupCallDto {
  @IsOptional()
  @IsString()
  targetExtension?: string;

  @IsOptional()
  @IsString()
  groupId?: string;

  @IsOptional()
  @IsUUID()
  queueId?: string;

  @IsOptional()
  @IsUUID()
  operatorLineId?: string;
}

export class ReceptionCallActionDto {
  @IsString()
  platformUuid!: string;

  @IsOptional()
  @IsUUID()
  operatorLineId?: string;
}

export class ReceptionTransferDto {
  @IsString()
  platformUuid!: string;

  @IsString()
  target!: string;

  @IsOptional()
  @IsBoolean()
  warm?: boolean;

  @IsOptional()
  @IsUUID()
  operatorLineId?: string;
}

export class ReceptionHoldDto extends ReceptionCallActionDto {
  @IsOptional()
  @IsBoolean()
  hold?: boolean;
}

export class ReceptionMuteDto extends ReceptionCallActionDto {
  @IsOptional()
  @IsBoolean()
  muted?: boolean;
}

export class ReceptionDtmfDto extends ReceptionCallActionDto {
  @IsString()
  digits!: string;
}

export class SetOperatorPresenceDto {
  @IsUUID()
  lineId!: string;

  @IsEnum(PresenceStatus)
  status!: PresenceStatus;

  @IsOptional()
  @IsString()
  customMessage?: string;
}
