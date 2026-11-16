import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EmailDispatchService } from './email-dispatch.service.js';

@Injectable()
export class EmailWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailWorkerService.name);
  private timer?: ReturnType<typeof setInterval>;
  private inFlight = false;

  constructor(private readonly dispatch: EmailDispatchService) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.tick();
    }, 30_000);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.inFlight) return;
    this.inFlight = true;
    try { await this.dispatch.processDue(); }
    catch (error) { this.logger.error(`Email worker failed: ${error instanceof Error ? error.message : 'unknown'}`); }
    finally { this.inFlight = false; }
  }
}
