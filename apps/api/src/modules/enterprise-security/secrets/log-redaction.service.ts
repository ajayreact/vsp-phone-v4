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

/** Phase 16 — mask secrets before logs leave the process. */
@Injectable()
export class LogRedactionService implements OnModuleInit {
  onModuleInit(): void {
    /* redaction applied via main.ts structured logging hook */
  }

  redact(input: unknown): string {
    const text = typeof input === 'string' ? input : JSON.stringify(input);
    return SENSITIVE_PATTERNS.reduce(
      (acc, pattern) =>
        acc.replace(pattern, (_m, prefix: string) => `${prefix}[REDACTED]`),
      text,
    );
  }
}

export function redactLogMessage(input: unknown): string {
  const text = typeof input === 'string' ? input : JSON.stringify(input);
  return SENSITIVE_PATTERNS.reduce(
    (acc, pattern) =>
      acc.replace(pattern, (_m, prefix: string) => `${prefix}[REDACTED]`),
    text,
  );
}
