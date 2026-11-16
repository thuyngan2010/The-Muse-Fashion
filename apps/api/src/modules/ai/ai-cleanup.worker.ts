import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AiJob } from './ai.schemas.js';
import { MediaObject } from '../storage/media-object.schema.js';
import { StorageService } from '../storage/storage.service.js';

const INPUT_RETENTION_MS = 24 * 60 * 60 * 1000;
const OUTPUT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class AiCleanupWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AiCleanupWorker.name);
  private timer?: ReturnType<typeof setInterval>;
  private inFlight = false;

  constructor(
    @InjectModel(AiJob.name) private readonly jobs: Model<AiJob>,
    @InjectModel(MediaObject.name) private readonly media: Model<MediaObject>,
    private readonly storage: StorageService,
  ) {}

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
    try { await this.run(); }
    catch (error) { this.logger.error(`AI cleanup failed: ${error instanceof Error ? error.message : 'unknown'}`); }
    finally { this.inFlight = false; }
  }

  async run(limit = 30): Promise<number> {
    const now = Date.now();
    const terminalJobs = await this.jobs.find({ $or: [
      { inputCleanupDone: false, terminalAt: { $lte: new Date(now - INPUT_RETENTION_MS) } },
      { outputCleanupDone: false, terminalAt: { $lte: new Date(now - OUTPUT_RETENTION_MS) } },
      { state: { $ne: 'EXPIRED' }, terminalAt: { $lte: new Date(now - OUTPUT_RETENTION_MS) } },
    ] }).sort({ terminalAt: 1 }).limit(limit).lean().exec();

    let cleaned = 0;
    for (const job of terminalJobs) {
      const terminalAt = job.terminalAt?.getTime() ?? now;
      const inputDue = terminalAt + INPUT_RETENTION_MS <= now;
      const outputDue = terminalAt + OUTPUT_RETENTION_MS <= now;
      const updates: Record<string, boolean> = {};

      if (inputDue && !job.inputCleanupDone && (!job.inputKeys?.length || await this.deleteKeys(job.inputKeys, true))) {
        updates.inputCleanupDone = true;
        cleaned += 1;
      }
      if (outputDue && !job.outputCleanupDone && (!job.outputKeys?.length || await this.deleteKeys(job.outputKeys))) {
        updates.outputCleanupDone = true;
        cleaned += 1;
      }
      if (outputDue && job.state !== 'EXPIRED') {
        await this.jobs.updateOne({ _id: job._id }, { $set: { state: 'EXPIRED', ...updates }, $unset: { renderPlan: 1 } }).exec();
      } else if (Object.keys(updates).length) {
        await this.jobs.updateOne({ _id: job._id }, { $set: updates }).exec();
      }
    }
    return cleaned;
  }

  private async deleteKeys(keys: string[], input = false): Promise<boolean> {
    let allDeleted = true;
    for (const key of keys) {
      const record = await this.media.findOne({ key }).exec();
      if (!record) continue;
      if (record.status === 'DELETED') continue;
      // A newer job can own the same input. Media cleanup owns the extended deadline.
      if (input && record.expiresAt && record.expiresAt > new Date()) continue;
      if (!await this.storage.deleteMediaRecord(record)) allDeleted = false;
    }
    return allDeleted;
  }
}
