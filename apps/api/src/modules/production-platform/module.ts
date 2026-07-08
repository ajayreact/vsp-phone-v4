import { Module } from '@nestjs/common';
import { ProductionPlatformCoreModule } from './production-platform-core.module';

@Module({
  imports: [ProductionPlatformCoreModule],
  exports: [ProductionPlatformCoreModule],
})
export class ProductionPlatformModule {}
