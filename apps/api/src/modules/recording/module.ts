import { Module } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { EnterpriseSecurityCoreModule } from '../enterprise-security/enterprise-security-core.module';
import { AdminRateLimitGuard } from '../enterprise-security/guards/scoped-rate-limit.guards';
import { RecordingAdminController } from './controllers/recording-admin.controller';
import { RecordingCoreModule } from './recording-core.module';

@Module({
  imports: [RecordingCoreModule, EnterpriseSecurityCoreModule],
  controllers: [RecordingAdminController],
  providers: [JwtAuthGuard, AdminRateLimitGuard],
  exports: [RecordingCoreModule],
})
export class RecordingModule {}
