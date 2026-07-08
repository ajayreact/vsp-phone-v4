import { Injectable } from '@nestjs/common';
import { ProductionConfigValidatorService } from '../configuration/production-config-validator.service';

/** Phase 18 — startup validation facade. */
@Injectable()
export class StartupValidationService {
  constructor(private readonly validator: ProductionConfigValidatorService) {}

  async validate() {
    return this.validator.validate();
  }

  getLastResult() {
    return this.validator.getLastResult();
  }
}
