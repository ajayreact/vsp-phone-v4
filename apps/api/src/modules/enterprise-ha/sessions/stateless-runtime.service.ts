import { Injectable } from '@nestjs/common';
import {
  STATELESS_RUNTIME_RULES,
  validateStatelessRuntime,
  type StatelessValidationResult,
} from './stateless-runtime.validation';

export { STATELESS_RUNTIME_RULES, validateStatelessRuntime, type StatelessValidationResult };

/** Phase 17 — documents and validates stateless API runtime posture. */
@Injectable()
export class StatelessRuntimeService {
  validate(): StatelessValidationResult {
    return validateStatelessRuntime();
  }
}
