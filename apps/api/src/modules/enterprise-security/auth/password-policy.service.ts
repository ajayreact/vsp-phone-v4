import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Phase 16 — password policy validation (registration/password change paths). */
@Injectable()
export class PasswordPolicyService {
  constructor(private readonly config: ConfigService) {}

  validate(password: string): void {
    const minLen = Number(this.config.get('PASSWORD_MIN_LENGTH') ?? '8');
    if (password.length < minLen) {
      throw new BadRequestException(`Password must be at least ${minLen} characters`);
    }
    if (this.config.get('PASSWORD_REQUIRE_UPPERCASE') === 'true' && !/[A-Z]/.test(password)) {
      throw new BadRequestException('Password must include an uppercase letter');
    }
    if (this.config.get('PASSWORD_REQUIRE_NUMBER') === 'true' && !/\d/.test(password)) {
      throw new BadRequestException('Password must include a number');
    }
    if (this.config.get('PASSWORD_REQUIRE_SPECIAL') === 'true' && !/[^A-Za-z0-9]/.test(password)) {
      throw new BadRequestException('Password must include a special character');
    }
  }
}
