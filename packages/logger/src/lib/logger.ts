/**
 * Structured logging utilities for VSP Phone v4.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LoggerOptions {
  context?: string;
  service?: string;
  format?: 'json' | 'text';
}

export interface Logger {
  debug(message: string, metadata?: Record<string, unknown>): void;
  info(message: string, metadata?: Record<string, unknown>): void;
  warn(message: string, metadata?: Record<string, unknown>): void;
  error(message: string, metadata?: Record<string, unknown>): void;
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const contextPrefix = options.context ? `[${options.context}] ` : '';
  const service = options.service ?? 'vsp';
  const format = options.format ?? (process.env['LOG_FORMAT'] as 'json' | 'text') ?? 'json';

  const write = (level: LogLevel, message: string, metadata?: Record<string, unknown>) => {
    if (format === 'json') {
      // eslint-disable-next-line no-console
      console[level](
        JSON.stringify({
          level,
          service,
          context: options.context,
          timestamp: new Date().toISOString(),
          message,
          ...(metadata ? { metadata } : {}),
        }),
      );
      return;
    }

    const payload = metadata ? ` ${JSON.stringify(metadata)}` : '';
    // eslint-disable-next-line no-console
    console[level](`${contextPrefix}${message}${payload}`);
  };

  return {
    debug: (message, metadata) => write('debug', message, metadata),
    info: (message, metadata) => write('info', message, metadata),
    warn: (message, metadata) => write('warn', message, metadata),
    error: (message, metadata) => write('error', message, metadata),
  };
}
