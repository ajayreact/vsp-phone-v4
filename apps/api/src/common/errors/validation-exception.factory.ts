import { UnprocessableEntityException } from '@nestjs/common';
import type { ValidationError } from 'class-validator';
import type { ValidationDetail } from './api-error.types';
import { humanizeValidationMessage, normalizeFieldName } from './error-mapper';

function flattenValidationErrors(
  errors: ValidationError[],
  parent = '',
): ValidationDetail[] {
  const result: ValidationDetail[] = [];
  for (const err of errors) {
    const field = parent ? `${parent}.${err.property}` : err.property;
    if (err.constraints) {
      for (const msg of Object.values(err.constraints)) {
        result.push({
          field: normalizeFieldName(field),
          message: humanizeValidationMessage(field, msg),
        });
      }
    }
    if (err.children?.length) {
      result.push(...flattenValidationErrors(err.children, field));
    }
  }
  return result;
}

/** ValidationPipe factory — returns 422 with structured field errors. */
export function validationExceptionFactory(errors: ValidationError[]): UnprocessableEntityException {
  const details = flattenValidationErrors(errors);
  const first = details[0];
  return new UnprocessableEntityException({
    code: 'VALIDATION_ERROR',
    message: first?.message ?? 'One or more fields are invalid.',
    field: first?.field ?? null,
    details: details.length > 0 ? details : null,
  });
}
