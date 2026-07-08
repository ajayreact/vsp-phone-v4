import { Injectable, Logger } from '@nestjs/common';
import type { LogCategory, LogSeverity, StructuredLogEntry } from './logging.types';

/** Phase 15 — async structured JSON logging (non-blocking). */
@Injectable()
export class TelecomStructuredLoggerService {
  private readonly logger = new Logger('telecom.structured');

  log(entry: Omit<StructuredLogEntry, 'timestamp'>): void {
    const payload: StructuredLogEntry = {
      timestamp: new Date().toISOString(),
      ...entry,
    };
    setImmediate(() => {
      const line = JSON.stringify(payload);
      switch (payload.severity) {
        case 'error':
          this.logger.error(line);
          break;
        case 'warn':
          this.logger.warn(line);
          break;
        case 'debug':
          this.logger.debug(line);
          break;
        default:
          this.logger.log(line);
      }
    });
  }

  fromEvent(params: {
    event: string;
    category: LogCategory;
    severity?: LogSeverity;
    tenantId?: string;
    platformUuid?: string;
    lineId?: string;
    extension?: string;
    userId?: string;
    deviceId?: string;
    direction?: StructuredLogEntry['direction'];
    durationMs?: number;
    detail?: Record<string, unknown>;
  }): void {
    this.log({
      event: params.event,
      category: params.category,
      severity: params.severity ?? 'info',
      tenantId: params.tenantId,
      platformUuid: params.platformUuid,
      lineId: params.lineId,
      extension: params.extension,
      userId: params.userId,
      deviceId: params.deviceId,
      direction: params.direction,
      durationMs: params.durationMs,
      detail: params.detail,
    });
  }
}
