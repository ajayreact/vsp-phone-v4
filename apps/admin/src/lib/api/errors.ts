import { ApiError } from './client';

/** Structured API error envelope from the backend. */
export interface ApiErrorResponse {
  success?: false;
  code?: string;
  message?: string;
  details?: unknown;
  field?: string | null;
  requestId?: string;
  timestamp?: string;
  /** Legacy shape */
  statusCode?: number;
  error?: string;
}

export interface FieldValidationError {
  field: string;
  message: string;
}

export function isDeveloperMode(): boolean {
  return process.env.NEXT_PUBLIC_DEVELOPER_MODE === 'true';
}

/** User-facing message from any thrown API/client error. */
export function getApiErrorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (error instanceof ApiError) {
    return error.message || fallback;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

export function getApiErrorCode(error: unknown): string | undefined {
  return error instanceof ApiError ? error.code : undefined;
}

export function getApiErrorField(error: unknown): string | null | undefined {
  return error instanceof ApiError ? error.field : undefined;
}

export function getApiErrorRequestId(error: unknown): string | undefined {
  return error instanceof ApiError ? error.requestId : undefined;
}

/** Field-level validation errors when details is an array. */
export function getFieldValidationErrors(error: unknown): FieldValidationError[] {
  if (!(error instanceof ApiError) || !Array.isArray(error.details)) return [];
  return error.details.filter(
    (d): d is FieldValidationError =>
      Boolean(d) &&
      typeof d === 'object' &&
      typeof (d as FieldValidationError).field === 'string' &&
      typeof (d as FieldValidationError).message === 'string',
  );
}

export function getFieldError(error: unknown, field: string): string | undefined {
  return getFieldValidationErrors(error).find((d) => d.field === field)?.message;
}

/** Append requestId in developer mode for support correlation. */
export function formatApiErrorForDisplay(error: unknown, fallback?: string): string {
  const message = getApiErrorMessage(error, fallback);
  if (!isDeveloperMode()) return message;
  const requestId = getApiErrorRequestId(error);
  return requestId ? `${message} (ref: ${requestId})` : message;
}
