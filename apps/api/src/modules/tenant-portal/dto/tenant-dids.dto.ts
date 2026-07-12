import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { RouteDestinationType } from '@prisma/client';

export class AssignDidDto {
  @IsEnum(RouteDestinationType)
  destinationType!: RouteDestinationType;

  /** Target entity id (line, queue, ivr, ring group, voicemail, conference) */
  @IsUUID()
  destinationId!: string;

  @IsOptional()
  @IsString()
  callerIdName?: string;

  @IsOptional()
  @IsUUID()
  siteId?: string;
}

export class DidDestinationsQueryDto {
  @IsEnum(RouteDestinationType)
  type!: RouteDestinationType;
}
