import { Module } from '@nestjs/common';
import { MigrationToolkitCoreModule } from './migration-toolkit-core.module';

@Module({
  imports: [MigrationToolkitCoreModule],
  exports: [MigrationToolkitCoreModule],
})
export class MigrationToolkitModule {}
