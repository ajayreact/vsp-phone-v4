import { Module } from '@nestjs/common';
import { IvrCoreModule } from './ivr-core.module';

@Module({
  imports: [IvrCoreModule],
  exports: [IvrCoreModule],
})
export class IvrModule {}
