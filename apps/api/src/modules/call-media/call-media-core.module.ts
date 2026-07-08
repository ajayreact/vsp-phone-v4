import { Module } from '@nestjs/common';
import { MusicOnHoldService } from './music-on-hold.service';
import { PromptManagementService } from './prompt-management.service';

@Module({
  providers: [PromptManagementService, MusicOnHoldService],
  exports: [PromptManagementService, MusicOnHoldService],
})
export class CallMediaCoreModule {}
