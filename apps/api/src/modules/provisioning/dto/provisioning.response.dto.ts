export class EnrollDeskPhoneResponseDto {
  deviceId!: string;
  mac!: string;
  provUrl!: string;
  configVersion!: number;
  artifactHash!: string;
  provHttpUsername!: string;
  status!: string;
}

export class RenderProvisioningResponseDto {
  artifactHash!: string;
  configVersion!: number;
  objectKey!: string;
}

export class ReprovisionResponseDto {
  artifactHash!: string;
  configVersion!: number;
}

export class RollbackResponseDto {
  artifactHash!: string;
  configVersion!: number;
}

export class AssignLineResponseDto {
  deviceId!: string;
  lineId!: string;
}
