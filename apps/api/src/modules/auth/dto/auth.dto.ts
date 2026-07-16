import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class LoginRequestDto {
  @ApiProperty({ example: 'agent@vsp.local' })
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MinLength(4)
  @MaxLength(128)
  password!: string;

  @ApiPropertyOptional({
    enum: ['platform', 'ops', 'tenant'],
    description: 'Portal hostname context — required for production multi-portal isolation',
  })
  @IsOptional()
  @IsIn(['platform', 'ops', 'tenant'])
  portal?: 'platform' | 'ops' | 'tenant';
}

export class LoginResponseDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty()
  tokenType!: string;

  @ApiProperty()
  expiresInSec!: number;

  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty({ format: 'uuid' })
  tenantId!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty({ enum: ['platform', 'ops', 'tenant'] })
  portal!: 'platform' | 'ops' | 'tenant';
}

export class ImpersonationExchangeDto {
  @ApiProperty({ description: 'One-time handoff code from platform impersonation' })
  @IsString()
  @IsNotEmpty()
  code!: string;
}

export class ImpersonationStartResponseDto {
  @ApiProperty({ description: 'One-time code to redeem on tenant.vspphone.com' })
  handoffCode!: string;

  @ApiProperty()
  expiresInSec!: number;

  @ApiProperty({ format: 'uuid' })
  tenantId!: string;

  @ApiProperty()
  tenantName!: string;

  @ApiProperty()
  tenantSlug!: string;
}

export class ImpersonationExitResponseDto {
  @ApiProperty({ description: 'One-time code to redeem on admin.vspphone.com' })
  handoffCode!: string;

  @ApiProperty()
  expiresInSec!: number;
}

export class RefreshRequestDto {
  @ApiPropertyOptional({ description: 'Reserved — refresh uses Bearer access token in Phase 10 lab' })
  @IsString()
  refreshToken?: string;
}

export class RefreshTokenRequestDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}

export class RefreshTokenIssueResponseDto {
  @ApiProperty()
  refreshToken!: string;

  @ApiProperty()
  expiresInSec!: number;
}

export class LogoutResponseDto {
  @ApiProperty()
  ok!: true;
}

export class MeTenantDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  slug!: string;
}

export class MeRoleDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;
}

export class MeProfileDto {
  @ApiProperty()
  firstName!: string;

  @ApiProperty()
  lastName!: string;

  @ApiProperty()
  displayName!: string;
}

export class MeResponseDto {
  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty({ format: 'uuid' })
  tenantId!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty({ enum: ['platform', 'ops', 'tenant'] })
  portal!: 'platform' | 'ops' | 'tenant';

  @ApiPropertyOptional({ format: 'uuid' })
  impersonatorUserId?: string;

  @ApiProperty({ type: [String] })
  permissions!: string[];

  @ApiProperty({ type: [MeRoleDto] })
  roles!: MeRoleDto[];

  @ApiPropertyOptional({ type: MeTenantDto })
  tenant?: MeTenantDto;

  @ApiPropertyOptional({ type: MeProfileDto })
  profile?: MeProfileDto;
}
