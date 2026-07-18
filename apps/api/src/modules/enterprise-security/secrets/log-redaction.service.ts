import { Injectable, OnModuleInit } from '@nestjs/common';

const SENSITIVE_PATTERNS: RegExp[] = [
  /("password"\s*:\s*")([^"]*)/gi,
  /("passwordHash"\s*:\s*")([^"]*)/gi,
  /("accessToken"\s*:\s*")([^"]*)/gi,
  /("refreshToken"\s*:\s*")([^"]*)/gi,
  /("authorization"\s*:\s*")([^"]*)/gi,
  /(Bearer\s+)([A-Za-z0-9._-]+)/gi,
  /(-----BEGIN [A-Z ]+-----)([\s\S]*?)(-----END [A-Z ]+-----)/gi,
];

function toRedactableText(input: unknown): string {
  if (input == null) return '';
  if (typeof input === 'string') return input;
  if (typeof input === 'number' || typeof input === 'boolean' || typeof input === 'bigint') {
    return String(input);
  }
  if (typeof input === 'symbol') return input.toString();
  try {
    // JSON.stringify(undefined) === undefined (not a string) — never pass that to .replace
    const serialized = JSON.stringify(input);
    return serialized === undefined ? String(input) : serialized;
  } catch {
    return Object.prototype.toString.call(input);
  }
}

function applyRedaction(text: string): string {
  return SENSITIVE_PATTERNS.reduce(
    (acc, pattern) =>
      acc.replace(pattern, (_m, prefix: string) => `${prefix}[REDACTED]`),
    text,
  );
}

/** Phase 16 — mask secrets before logs leave the process. */
@Injectable()
export class LogRedactionService implements OnModuleInit {
  onModuleInit(): void {
    /* redaction applied via main.ts structured logging hook */
  }

  redact(input: unknown): string {
    return applyRedaction(toRedactableText(input));
  }
}

/** Null-safe — must never throw (SecurityExceptionFilter / Logger.overrideLogger). */
export function redactLogMessage(input: unknown): string {
  return applyRedaction(toRedactableText(input));
}
