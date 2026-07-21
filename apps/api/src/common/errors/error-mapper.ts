import { HttpException, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { MappedApiError, ValidationDetail } from './api-error.types';
import {
  MAC_ALREADY_EXISTS_CODE,
  MAC_ALREADY_EXISTS_MESSAGE,
} from '../../modules/provisioning/utils/mac-conflict.util';

const LEAK_PATTERNS = [
  /\/apps\/api\//i,
  /prisma/i,
  /PrismaClient/i,
  /redis/i,
  /ioredis/i,
  /ECONNREFUSED/i,
  /ECONNRESET/i,
  /invalid input syntax for type uuid/i,
  /invalid uuid/i,
  /sql/i,
  /stack/i,
  /password/i,
  /secret/i,
  /Bearer\s+/i,
];

const MAC_FORMAT_HINT =
  'Expected format: EC74D751E3E7 or EC:74:D7:51:E3:E7';

type MessageRule = {
  match: RegExp | string;
  status?: number;
  code: string;
  message: string;
  field?: string | null;
  details?: unknown;
};

/** Known exception messages → user-facing business errors (no throw-site changes). */
const MESSAGE_RULES: MessageRule[] = [
  {
    match: /^Invalid credentials$/i,
    code: 'INVALID_CREDENTIALS',
    message: 'Invalid email or password.',
    status: HttpStatus.UNAUTHORIZED,
  },
  {
    match: /Account temporarily locked/i,
    code: 'ACCOUNT_LOCKED',
    message: 'Too many failed login attempts. Please try again later.',
    status: HttpStatus.UNAUTHORIZED,
  },
  {
    match: /Authentication unavailable/i,
    code: 'AUTH_UNAVAILABLE',
    message: 'Sign-in is temporarily unavailable. Please try again shortly.',
    status: HttpStatus.SERVICE_UNAVAILABLE,
  },
  {
    match: /Too many authentication attempts/i,
    code: 'RATE_LIMITED',
    message: 'Too many sign-in attempts. Please wait and try again.',
    status: HttpStatus.TOO_MANY_REQUESTS,
  },
  {
    match: /cannot sign in to|cannot use tenant portal login|portal login/i,
    code: 'PORTAL_ACCESS_DENIED',
    message: 'Your account does not have permission to access this portal.',
    status: HttpStatus.FORBIDDEN,
  },
  {
    match: /Insufficient permissions/i,
    code: 'FORBIDDEN',
    message: 'You do not have permission to perform this action.',
    status: HttpStatus.FORBIDDEN,
  },
  {
    match: /Missing bearer token|Invalid or expired token|Session invalidated/i,
    code: 'SESSION_EXPIRED',
    message: 'Your session has expired. Please sign in again.',
    status: HttpStatus.UNAUTHORIZED,
  },
  {
    match: /^Invalid MAC address$/i,
    code: 'INVALID_MAC_ADDRESS',
    message: 'Invalid MAC address.',
    field: 'macAddress',
    details: MAC_FORMAT_HINT,
    status: HttpStatus.UNPROCESSABLE_ENTITY,
  },
  {
    match: /MAC already enrolled|MAC address already in use/i,
    code: MAC_ALREADY_EXISTS_CODE,
    message: MAC_ALREADY_EXISTS_MESSAGE,
    field: 'macAddress',
    details:
      'Either remove the existing device or clear its MAC address before adding it again.',
    status: HttpStatus.CONFLICT,
  },
  {
    match: /already provisioned/i,
    code: 'DEVICE_ALREADY_PROVISIONED',
    message: 'This phone has already been provisioned.',
    status: HttpStatus.CONFLICT,
  },
  {
    match: /Line already has an extension|Extension already/i,
    code: 'EXTENSION_ALREADY_EXISTS',
    message: 'Extension already exists.',
    field: 'extension',
    status: HttpStatus.CONFLICT,
  },
  {
    match: /Extension .* already has a device|already has a device assigned/i,
    code: 'EXTENSION_ALREADY_ASSIGNED',
    message: 'This extension already has a device assigned.',
    field: 'extension',
    status: HttpStatus.CONFLICT,
  },
  {
    match: /Configuration artifact missing|Unable to generate|provision.*failed|Desk SIP credential missing/i,
    code: 'PROVISIONING_FAILED',
    message: 'Unable to generate provisioning configuration. Please try again.',
    status: HttpStatus.BAD_REQUEST,
  },
  {
    match: /has not contacted|offline|not registered/i,
    code: 'PHONE_OFFLINE',
    message: 'The phone has not contacted the provisioning server.',
    status: HttpStatus.BAD_REQUEST,
  },
  {
    match: /User email already exists/i,
    code: 'EMAIL_ALREADY_EXISTS',
    message: 'This email address is already in use.',
    field: 'email',
    status: HttpStatus.CONFLICT,
  },
  {
    match: /Device not found/i,
    code: 'DEVICE_NOT_FOUND',
    message: 'Device not found.',
    status: HttpStatus.NOT_FOUND,
  },
  {
    match: /Extension not found/i,
    code: 'EXTENSION_NOT_FOUND',
    message: 'Extension not found.',
    status: HttpStatus.NOT_FOUND,
  },
  {
    match: / not found$/i,
    code: 'NOT_FOUND',
    message: 'The requested resource was not found.',
    status: HttpStatus.NOT_FOUND,
  },
  {
    match: /Service is shutting down/i,
    code: 'SERVICE_UNAVAILABLE',
    message: 'The service is temporarily unavailable. Please try again.',
    status: HttpStatus.SERVICE_UNAVAILABLE,
  },
];

export function normalizeFieldName(field: string): string {
  const leaf = field.split('.').pop() ?? field;
  const map: Record<string, string> = {
    mac: 'macAddress',
    mac_address: 'macAddress',
    macAddress: 'macAddress',
    email: 'email',
    extension: 'extension',
    lineId: 'lineId',
    password: 'password',
  };
  return map[leaf] ?? leaf;
}

export function humanizeValidationMessage(field: string, raw: string): string {
  const normalized = normalizeFieldName(field);
  const lower = raw.toLowerCase();

  if (normalized === 'macAddress' || normalized === 'mac') {
    if (lower.includes('mac')) return 'Invalid MAC address.';
    return raw;
  }
  if (normalized === 'email') {
    if (lower.includes('email')) return 'Enter a valid email address.';
    return raw;
  }
  if (normalized === 'extension') {
    if (lower.includes('exist')) return 'Extension already exists.';
    return raw;
  }
  if (lower.includes('should not be empty') || lower.includes('must be a')) {
    return 'This field is required.';
  }
  return sanitizeClientMessage(raw);
}

export function mapException(exception: unknown): MappedApiError {
  if (exception instanceof HttpException) {
    return mapHttpException(exception);
  }
  if (exception instanceof Prisma.PrismaClientKnownRequestError) {
    return mapPrismaKnownError(exception);
  }
  if (exception instanceof Prisma.PrismaClientValidationError) {
    return {
      status: HttpStatus.BAD_REQUEST,
      code: 'INVALID_REQUEST',
      message: 'The request contains invalid data.',
      details: null,
      field: null,
    };
  }
  return mapUnknownError(exception);
}

function mapHttpException(exception: HttpException): MappedApiError {
  const status = exception.getStatus();
  const body = exception.getResponse();

  if (typeof body === 'string') {
    return applyMessageRules(sanitizeClientMessage(body), status);
  }

  if (body && typeof body === 'object') {
    const obj = body as Record<string, unknown>;

    if (typeof obj.code === 'string' && typeof obj.message === 'string') {
      return {
        status,
        code: obj.code,
        message: sanitizeClientMessage(obj.message),
        details: obj.details ?? null,
        field: typeof obj.field === 'string' ? obj.field : null,
      };
    }

    if (Array.isArray(obj.message)) {
      const details: ValidationDetail[] = obj.message.map((msg, i) => ({
        field: inferFieldFromMessage(String(msg), i),
        message: humanizeValidationMessage('', String(msg)),
      }));
      const first = details[0];
      return {
        status: status === HttpStatus.BAD_REQUEST ? HttpStatus.UNPROCESSABLE_ENTITY : status,
        code: 'VALIDATION_ERROR',
        message: first?.message ?? 'One or more fields are invalid.',
        details,
        field: first?.field ?? null,
      };
    }

    const rawMessage = String(obj.message ?? obj.error ?? '');
    if (rawMessage) {
      return applyMessageRules(sanitizeClientMessage(rawMessage), status, obj);
    }
  }

  return defaultForStatus(status);
}

function mapPrismaKnownError(err: Prisma.PrismaClientKnownRequestError): MappedApiError {
  switch (err.code) {
    case 'P2002': {
      const target = err.meta?.target;
      const fields = Array.isArray(target)
        ? target.map(String)
        : typeof target === 'string'
          ? [target]
          : [];
      const joined = fields.join(',').toLowerCase();

      if (joined.includes('mac_address')) {
        return {
          status: HttpStatus.CONFLICT,
          code: MAC_ALREADY_EXISTS_CODE,
          message: MAC_ALREADY_EXISTS_MESSAGE,
          field: 'macAddress',
          details:
            'Either remove the existing device or clear its MAC address before adding it again.',
        };
      }
      if (joined.includes('email')) {
        return {
          status: HttpStatus.CONFLICT,
          code: 'EMAIL_ALREADY_EXISTS',
          message: 'This email address is already in use.',
          field: 'email',
          details: null,
        };
      }
      if (joined.includes('extension')) {
        return {
          status: HttpStatus.CONFLICT,
          code: 'EXTENSION_ALREADY_EXISTS',
          message: 'Extension already exists.',
          field: 'extension',
          details: null,
        };
      }
      return {
        status: HttpStatus.CONFLICT,
        code: 'DUPLICATE_RESOURCE',
        message: 'This record already exists.',
        details: null,
        field: null,
      };
    }
    case 'P2025':
      return {
        status: HttpStatus.NOT_FOUND,
        code: 'NOT_FOUND',
        message: 'The requested resource was not found.',
        details: null,
        field: null,
      };
    case 'P2003':
      return {
        status: HttpStatus.BAD_REQUEST,
        code: 'INVALID_REFERENCE',
        message: 'The request references a resource that does not exist.',
        details: null,
        field: null,
      };
    default:
      return {
        status: HttpStatus.BAD_REQUEST,
        code: 'INVALID_REQUEST',
        message: 'The request could not be processed.',
        details: null,
        field: null,
      };
  }
}

function mapUnknownError(exception: unknown): MappedApiError {
  const raw =
    exception instanceof Error
      ? exception.message
      : typeof exception === 'string'
        ? exception
        : 'Unknown error';

  const ruled = applyMessageRules(raw, HttpStatus.INTERNAL_SERVER_ERROR);
  if (ruled.code !== 'INTERNAL_ERROR' || ruled.status !== HttpStatus.INTERNAL_SERVER_ERROR) {
    return ruled;
  }

  if (LEAK_PATTERNS.some((p) => p.test(raw))) {
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred. Please try again or contact support.',
      details: null,
      field: null,
    };
  }

  return applyMessageRules(sanitizeClientMessage(raw), HttpStatus.INTERNAL_SERVER_ERROR);
}

function applyMessageRules(
  message: string,
  status: number,
  obj?: Record<string, unknown>,
): MappedApiError {
  for (const rule of MESSAGE_RULES) {
    const matched =
      typeof rule.match === 'string'
        ? message.toLowerCase() === rule.match.toLowerCase()
        : rule.match.test(message);
    if (matched) {
      return {
        status: rule.status ?? status,
        code: rule.code,
        message: rule.message,
        field: rule.field ?? null,
        details: rule.details ?? null,
      };
    }
  }

  if (typeof obj?.code === 'string') {
    return {
      status,
      code: obj.code,
      message,
      details: obj.details ?? null,
      field: typeof obj.field === 'string' ? obj.field : null,
    };
  }

  return defaultForStatus(status, message);
}

function defaultForStatus(status: number, message?: string): MappedApiError {
  const safeMessage = message ? sanitizeClientMessage(message) : undefined;

  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return {
        status,
        code: 'BAD_REQUEST',
        message: safeMessage ?? 'The request could not be processed.',
        details: null,
        field: null,
      };
    case HttpStatus.UNAUTHORIZED:
      return {
        status,
        code: 'UNAUTHORIZED',
        message: safeMessage ?? 'Invalid email or password.',
        details: null,
        field: null,
      };
    case HttpStatus.FORBIDDEN:
      return {
        status,
        code: 'FORBIDDEN',
        message: safeMessage ?? 'You do not have permission to perform this action.',
        details: null,
        field: null,
      };
    case HttpStatus.NOT_FOUND:
      return {
        status,
        code: 'NOT_FOUND',
        message: safeMessage ?? 'The requested resource was not found.',
        details: null,
        field: null,
      };
    case HttpStatus.CONFLICT:
      return {
        status,
        code: 'CONFLICT',
        message: safeMessage ?? 'This action conflicts with existing data.',
        details: null,
        field: null,
      };
    case HttpStatus.UNPROCESSABLE_ENTITY:
      return {
        status,
        code: 'VALIDATION_ERROR',
        message: safeMessage ?? 'One or more fields are invalid.',
        details: null,
        field: null,
      };
    case HttpStatus.TOO_MANY_REQUESTS:
      return {
        status,
        code: 'RATE_LIMITED',
        message: safeMessage ?? 'Too many requests. Please wait and try again.',
        details: null,
        field: null,
      };
    case HttpStatus.SERVICE_UNAVAILABLE:
      return {
        status,
        code: 'SERVICE_UNAVAILABLE',
        message: safeMessage ?? 'The service is temporarily unavailable.',
        details: null,
        field: null,
      };
    default:
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred. Please try again or contact support.',
        details: null,
        field: null,
      };
  }
}

function inferFieldFromMessage(msg: string, index: number): string {
  const lower = msg.toLowerCase();
  if (lower.includes('mac')) return 'macAddress';
  if (lower.includes('email')) return 'email';
  if (lower.includes('extension')) return 'extension';
  if (lower.includes('password')) return 'password';
  return `field_${index}`;
}

export function sanitizeClientMessage(raw: string): string {
  if (LEAK_PATTERNS.some((p) => p.test(raw))) {
    return 'The request could not be processed.';
  }
  return raw;
}
