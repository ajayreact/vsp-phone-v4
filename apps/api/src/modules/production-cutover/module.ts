import { Module } from '@nestjs/common';
import { ProductionCutoverCoreModule } from './production-cutover-core.module';

@Module({
  imports: [ProductionCutoverCoreModule],
  exports: [ProductionCutoverCoreModule],
})
export class ProductionCutoverModule {}
