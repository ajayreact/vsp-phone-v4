import { Module } from '@nestjs/common';
import { QueueCoreModule } from './queue-core.module';

@Module({
  imports: [QueueCoreModule],
  exports: [QueueCoreModule],
})
export class QueueModule {}
