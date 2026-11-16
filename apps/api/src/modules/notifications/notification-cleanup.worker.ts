import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Notification } from './notification.schema.js';

const RETENTION_MS = 365 * 24 * 60 * 60 * 1000;

@Injectable()
export class NotificationCleanupWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationCleanupWorker.name);
  private timer?: ReturnType<typeof setInterval>;
  private inFlight = false;

  constructor(@InjectModel(Notification.name) private readonly notifications: Model<Notification>) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.tick();
    }, 6 * 60 * 60 * 1000);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.inFlight) return;
    this.inFlight = true;
    try { await this.run(); }
    catch (error) { this.logger.error(`Notification cleanup failed: ${error instanceof Error ? error.message : 'unknown'}`); }
    finally { this.inFlight = false; }
  }

  async run(limit = 200): Promise<number> {
    const cutoff = new Date(Date.now() - RETENTION_MS);
    const stale = await this.notifications.find({ createdAt: { $lt: cutoff } }).limit(limit).select('_id').lean().exec();
    if (!stale.length) return 0;
    const result = await this.notifications.deleteMany({ _id: { $in: stale.map((row) => row._id) } }).exec();
    return result.deletedCount ?? 0;
  }
}
