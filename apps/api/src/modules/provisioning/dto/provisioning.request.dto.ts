import { IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Min } from 'class-validator';

export class EnrollDeskPhoneRequestDto {
  @IsString()
  @Matches(/^[a-fA-F0-9:-]{12,17}$/)
  mac!: string;

  @IsString()
  name!: string;

  @IsUUID()
  lineId!: string;

  @IsOptional()
  @IsString()
  modelFamily?: string;

  @IsOptional()
  @IsUUID()
  siteId?: string;

  @IsOptional()
  @IsIn(['stable', 'n-1', 'emergency'])
  firmwareChannel?: 'stable' | 'n-1' | 'emergency';
}

export class AssignLineRequestDto {
  @IsUUID()
  lineId!: string;
}

export class RenderProvisioningRequestDto {
  @IsUUID()
  deviceId!: string;

  @IsOptional()
  @IsUUID()
  tenantId?: string;
}

export class RollbackProvisioningRequestDto {
  @IsUUID()
  deviceId!: string;

  @IsInt()
  @Min(1)
  targetConfigVersion!: number;
}

export class ReprovisionRequestDto {
  @IsUUID()
  deviceId!: string;
}
