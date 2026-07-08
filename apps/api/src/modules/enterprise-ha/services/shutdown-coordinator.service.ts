import {
  Injectable,
  Logger,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { HA_EVENTS } from '../events/ha.events';
import { GracefulShutdownService } from './graceful-shutdown.service';

/** Phase 17 — graceful shutdown: drain in-flight requests before closing connections. */
@Injectable()
export class ShutdownCoordinatorService implements OnApplicationShutdown {
  private readonly logger = new Logger(ShutdownCoordinatorService.name);
  private draining = false;
  private inFlight = 0;

  constructor(
    private readonly config: ConfigService,
    private readonly events: EventEmitter2,
    private readonly gracefulShutdown: GracefulShutdownService,
  ) {}

  beginRequest(): void {
    if (!this.draining) this.inFlight += 1;
  }

  endRequest(): void {
    this.inFlight = Math.max(0, this.inFlight - 1);
  }

  isDraining(): boolean {
    return this.draining;
  }

  isReady(): boolean {
    return !this.draining;
  }

  inFlightCount(): number {
    return this.inFlight;
  }

  async onApplicationShutdown(signal?: string): Promise<void> {
    this.draining = true;
    this.events.emit(HA_EVENTS.SHUTDOWN_START, { signal });
    this.logger.log(JSON.stringify({ event: 'ha.shutdown.start', signal, inFlight: this.inFlight }));

    const drainMs = Number(this.config.get('SHUTDOWN_DRAIN_MS') ?? '30000');
    const deadline = Date.now() + drainMs;
    while (this.inFlight > 0 && Date.now() < deadline) {
      await sleep(100);
    }

    this.logger.log(
      JSON.stringify({
        event: 'ha.shutdown.drained',
        inFlight: this.inFlight,
        drainedMs: drainMs,
      }),
    );
    await this.gracefulShutdown.flush();
    this.events.emit(HA_EVENTS.SHUTDOWN_COMPLETE, { inFlight: this.inFlight });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
