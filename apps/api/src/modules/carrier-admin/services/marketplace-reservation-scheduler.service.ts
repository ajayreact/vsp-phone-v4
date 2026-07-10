import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { TelnyxNumberRequestsService } from './telnyx-number-requests.service';

const EXPIRY_INTERVAL_MS = 5 * 60 * 1000;

@Injectable()
export class MarketplaceReservationSchedulerService implements OnModuleInit, OnModuleDestroy {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly requests: TelnyxNumberRequestsService) {}

  onModuleInit() {
    void this.requests.expireStaleReservations();
    this.timer = setInterval(() => {
      void this.requests.expireStaleReservations();
    }, EXPIRY_INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
}
