import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class NocTenantQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  tenantId?: string;
}

export class SipRegistrationQueryDto extends NocTenantQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;
}

export class SipTraceQueryDto extends NocTenantQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  callId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  extension?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  number?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ip?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  method?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  platformUuid?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}

export class CallDiagnosticsQueryDto extends NocTenantQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  platformUuid?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  extension?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  callerNumber?: string;
}

export class AlertQueryDto extends NocTenantQueryDto {
  @ApiPropertyOptional({ enum: ['OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'ESCALATED', 'SILENCED'] })
  @IsOptional()
  @IsIn(['OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'ESCALATED', 'SILENCED'])
  status?: string;

  @ApiPropertyOptional({ enum: ['CRITICAL', 'MAJOR', 'MINOR', 'INFO'] })
  @IsOptional()
  @IsIn(['CRITICAL', 'MAJOR', 'MINOR', 'INFO'])
  severity?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}

export class AlertActionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(86400)
  silenceMinutes?: number;
}

export class SipRegistrationActionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}
