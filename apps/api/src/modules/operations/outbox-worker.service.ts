import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { OutboxProcessorService } from './outbox-processor.service.js';

@Injectable()
export class OutboxWorkerService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private inFlight = false;
  private readonly logger = new Logger(OutboxWorkerService.name);

  constructor(private readonly processor: OutboxProcessorService) {}

  onModuleInit(): void {
    this.timer = setInterval(() => { void this.tick(); }, 15_000);
  }

  private async tick(): Promise<void> {
    if (this.inFlight) return;
    this.inFlight = true;
    try { await this.processor.processDue(); }
    catch (error) { this.logger.error('Outbox processing tick failed', error); }
    finally { this.inFlight = false; }
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
