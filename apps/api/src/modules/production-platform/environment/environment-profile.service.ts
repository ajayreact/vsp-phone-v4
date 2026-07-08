import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  profileValidationPolicy,
  resolveEnvironmentProfile,
  type EnvironmentProfile,
  type ProfileValidationPolicy,
} from './environment-profile';

/** Phase 18 — active deployment environment profile. */
@Injectable()
export class EnvironmentProfileService {
  readonly profile: EnvironmentProfile;
  readonly policy: ProfileValidationPolicy;

  constructor(private readonly config: ConfigService) {
    this.profile = resolveEnvironmentProfile(this.config.get<string>('VSP_ENV'));
    this.policy = profileValidationPolicy(this.profile);
  }

  describe(): Record<string, unknown> {
    return {
      profile: this.profile,
      nodeEnv: this.config.get('NODE_ENV'),
      policy: this.policy,
    };
  }
}
