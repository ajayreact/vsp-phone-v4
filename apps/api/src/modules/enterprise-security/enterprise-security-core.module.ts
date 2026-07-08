import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { EnterpriseObservabilityCoreModule } from '../enterprise-observability/enterprise-observability-core.module';
import { TelecomInfrastructureModule } from '../telecom/telecom-infrastructure.module';
import { SecurityAuditService } from './audit/security-audit.service';
import { AuthHardeningService } from './auth/auth-hardening.service';
import { PasswordPolicyService } from './auth/password-policy.service';
import { PermissionsService } from './auth/permissions.service';
import { RefreshTokenService } from './auth/refresh-token.service';
import { SecurityExceptionFilter } from './filters/security-exception.filter';
import { SecurityHeadersMiddleware } from './headers/security-headers.middleware';
import {
  AdminRateLimitGuard,
  AuthRateLimitGuard,
  ProvisioningRateLimitGuard,
  WebrtcRateLimitGuard,
} from './guards/scoped-rate-limit.guards';
import { PermissionsGuard } from './guards/permissions.guard';
import { RateLimitService } from './rate-limit/rate-limit.service';
import { LogRedactionService } from './secrets/log-redaction.service';
import { SecretValidationService } from './secrets/secret-validation.service';
import {
  TelecomAuthorizationInterceptor,
  TelecomAuthorizationService,
} from './telecom/telecom-authorization.service';

@Module({
  imports: [TelecomInfrastructureModule, EnterpriseObservabilityCoreModule],
  providers: [
    RateLimitService,
    AuthHardeningService,
    RefreshTokenService,
    PasswordPolicyService,
    PermissionsService,
    SecurityAuditService,
    LogRedactionService,
    SecretValidationService,
    SecurityHeadersMiddleware,
    TelecomAuthorizationService,
    TelecomAuthorizationInterceptor,
    AuthRateLimitGuard,
    WebrtcRateLimitGuard,
    ProvisioningRateLimitGuard,
    AdminRateLimitGuard,
    PermissionsGuard,
    { provide: APP_FILTER, useClass: SecurityExceptionFilter },
  ],
  exports: [
    RateLimitService,
    AuthHardeningService,
    RefreshTokenService,
    PasswordPolicyService,
    PermissionsService,
    SecurityAuditService,
    LogRedactionService,
    SecretValidationService,
    SecurityHeadersMiddleware,
    TelecomAuthorizationService,
    TelecomAuthorizationInterceptor,
    AuthRateLimitGuard,
    WebrtcRateLimitGuard,
    ProvisioningRateLimitGuard,
    AdminRateLimitGuard,
    PermissionsGuard,
  ],
})
export class EnterpriseSecurityCoreModule {}
