import { Module } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { TelecomRedisService } from './redis/telecom-redis.service';

/** Shared Prisma + Redis for telecom and carrier modules (avoids circular imports). */
@Module({
  providers: [PrismaService, TelecomRedisService],
  exports: [PrismaService, TelecomRedisService],
})
export class TelecomInfrastructureModule {}
