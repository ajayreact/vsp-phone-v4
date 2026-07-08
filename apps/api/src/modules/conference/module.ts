import { Module } from '@nestjs/common';
import { ConferenceCoreModule } from './conference-core.module';

@Module({
  imports: [ConferenceCoreModule],
  exports: [ConferenceCoreModule],
})
export class ConferenceModule {}
