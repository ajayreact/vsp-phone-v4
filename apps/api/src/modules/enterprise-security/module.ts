import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { EnterpriseSecurityCoreModule } from './enterprise-security-core.module';
import { SecurityHeadersMiddleware } from './headers/security-headers.middleware';

@Module({
  imports: [EnterpriseSecurityCoreModule],
  exports: [EnterpriseSecurityCoreModule],
})
export class EnterpriseSecurityModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(SecurityHeadersMiddleware).forRoutes('*');
  }
}
