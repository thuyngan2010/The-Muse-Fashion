import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { StorageService } from './storage.service.js';

@Injectable()
export class StorageCleanupWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StorageCleanupWorker.name);
  private timer?: ReturnType<typeof setInterval>;
  private inFlight = false;

  constructor(private readonly storage: StorageService) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.tick();
    }, 60_000);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.inFlight) return;
    this.inFlight = true;
    try {
      await this.storage.reconcileCommunityRetention();
      await this.storage.cleanupExpired();
      await this.storage.reconcilePublication();
    }
    catch (error) { this.logger.error(`Storage cleanup failed: ${error instanceof Error ? error.message : 'unknown'}`); }
    finally { this.inFlight = false; }
  }
}
