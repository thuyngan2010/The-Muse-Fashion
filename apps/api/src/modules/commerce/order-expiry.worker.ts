import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { OrderService } from './order.service.js';

@Injectable()
export class OrderExpiryWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private inFlight = false;
  private readonly logger = new Logger(OrderExpiryWorker.name);

  constructor(private readonly orders: OrderService) {}

  onModuleInit(): void {
    this.timer = setInterval(() => { void this.tick(); }, 60_000);
  }

  private async tick(): Promise<void> {
    if (this.inFlight) return;
    this.inFlight = true;
    try { await this.orders.expireDueOrders(); }
    catch (error) { this.logger.error('Order expiry tick failed', error); }
    finally { this.inFlight = false; }
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
