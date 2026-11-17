import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, type HydratedDocument } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { AppConfig } from '../../common/app-config.js';
import { Product } from '../catalog/product.schema.js';
import { MediaObject } from '../storage/media-object.schema.js';
import { StorageService } from '../storage/storage.service.js';
import { AiJob } from './ai.schemas.js';
import { AiProviderService } from './ai-provider.service.js';
import { AiService } from './ai.service.js';
import { AiFashionPlannerService } from './ai-fashion-planner.service.js';
import { FashionInputError } from './fashion-plan.js';

@Injectable()
export class AiWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AiWorkerService.name);
  private timer?: ReturnType<typeof setInterval>;
  private inFlight = false;

  constructor(
    @InjectModel(AiJob.name) private readonly jobs: Model<AiJob>,
    @InjectModel(Product.name) private readonly products: Model<Product>,
    @InjectModel(MediaObject.name) private readonly media: Model<MediaObject>,
    private readonly provider: AiProviderService,
    private readonly ai: AiService,
    private readonly storage: StorageService,
    private readonly planner: AiFashionPlannerService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.tick();
    }, 5_000);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.inFlight) return;
    this.inFlight = true;
    try { await this.processPending(); }
    catch (error) { this.logger.error(`AI worker failed: ${error instanceof Error ? error.message : 'unknown'}`); }
    finally { this.inFlight = false; }
  }

  async processPending(limit = 5): Promise<void> {
    if (!this.provider.isEnabled()) return;
    const now = new Date();
    const renderTimeout = Number(AppConfig.optional('AI_REQUEST_TIMEOUT_MS') ?? 120000);
    const analysisTimeout = this.planner.isEnabled() ? Number(AppConfig.optional('AI_PLANNER_TIMEOUT_MS') ?? 90000) : 0;
    const leaseMs = Math.max(5 * 60_000,
      (Number.isFinite(renderTimeout) ? Math.min(renderTimeout, 600000) : 120000)
      + (Number.isFinite(analysisTimeout) ? Math.min(analysisTimeout, 120000) : 90000) + 60_000);
    const exhausted = await this.jobs.find({ state: 'PROCESSING', attempts: { $gte: 10 }, leaseUntil: { $lte: now } }).limit(limit).lean().exec();
    for (const job of exhausted) await this.ai.failJob(String(job._id), 'AI processing lease expired', true, job.leaseId);
    const pending = await this.jobs.find({ attempts: { $lt: 10 }, $or: [
      { state: 'PENDING', $or: [{ nextAttemptAt: null }, { nextAttemptAt: { $lte: now } }] },
      { state: 'PROCESSING', leaseUntil: { $lte: now } },
    ] }).sort({ createdAt: 1 }).limit(limit).exec();
    for (const job of pending) {
      const leaseId = randomUUID();
      const claimed = await this.jobs.findOneAndUpdate(
        { _id: job._id, attempts: { $lt: 10 }, $or: [
          { state: 'PENDING', $or: [{ nextAttemptAt: null }, { nextAttemptAt: { $lte: now } }] },
          { state: 'PROCESSING', leaseUntil: { $lte: now } },
        ] },
        { $set: { state: 'PROCESSING', leaseUntil: new Date(Date.now() + leaseMs), leaseId }, $inc: { attempts: 1 } },
        { new: true },
      ).exec();
      if (!claimed) continue;

      let outputRecord: HydratedDocument<MediaObject> | undefined;
      try {
        // Once a POST might have reached the provider, an absent polling ID must never trigger another POST.
        if (!claimed.providerJobId) {
          if (claimed.providerSubmitStartedAt) {
            await this.ai.failJob(String(claimed._id), 'AI provider submission outcome is unknown', true, leaseId);
            continue;
          }
        }
        const inputMedia = await this.media.findById(claimed.inputMediaId).lean().exec();
        if (!inputMedia?.key) {
          await this.ai.failJob(String(claimed._id), 'Input photo is missing', true, leaseId);
          continue;
        }
        const inputUrl = await this.storage.signedReadUrl(inputMedia.key, 600);
        if (!inputUrl) {
          await this.ai.failJob(String(claimed._id), 'Unable to access input photo', true, leaseId);
          continue;
        }

        const products = await this.products.find({ _id: { $in: claimed.productIds }, status: 'PUBLISHED' }).lean().exec();
        const mediaIds = products.flatMap((product) => product.imageMediaIds ?? []).map(String);
        const productMedia = mediaIds.length
          ? await this.media.find({ _id: { $in: mediaIds }, purpose: 'product', status: 'READY' }).lean().exec()
          : [];
        const mediaById = new Map(productMedia.map((item) => [String(item._id), item]));
        // Keep one reference per selected product in request order, rather than letting
        // multiple images of the first product consume all reference slots.
        const references = await Promise.all(claimed.productIds.map(async (id) => {
          const product = products.find(p => String(p._id) === String(id));
          if (!product) throw new FashionInputError('Một sản phẩm không còn khả dụng. Vui lòng chọn lại sản phẩm.');
          let imageUrl = product.images?.find(Boolean);
          if (!imageUrl) {
            const item = (product.imageMediaIds ?? []).map(id => mediaById.get(String(id))).find(Boolean);
            if (item) imageUrl = (item.visibility === 'PUBLIC' ? this.storage.publicUrl(item.key) : null)
              ?? await this.storage.signedReadUrl(item.key, 600) ?? undefined;
          }
          if (!imageUrl) throw new FashionInputError('Mỗi sản phẩm cần có ảnh tham chiếu để thử đồ.');
          return { id: String(id), name: product.name, description: product.description ?? '', material: product.material ?? '', imageUrl };
        }));
        const productImageUrls = references.map(p => p.imageUrl);
        const setPhase = async (phase: 'ANALYZING' | 'PLANNING' | 'GENERATING') => {
          const changed = await this.jobs.updateOne({ _id: claimed._id, leaseId, state: 'PROCESSING' }, { $set: { phase } }).exec();
          if (changed.matchedCount !== 1) throw new Error('AI job lease was lost');
        };
        let renderPlan = claimed.renderPlan;
        if (!claimed.providerJobId && !renderPlan && this.planner.isEnabled()) {
          renderPlan = await this.planner.plan({ type: claimed.type as 'TRY_ON' | 'MIX_MATCH', style: claimed.style, body: { heightCm: claimed.heightCm, weightKg: claimed.weightKg }, inputUrl, products: references }, setPhase);
          const saved = await this.jobs.updateOne({ _id: claimed._id, leaseId, state: 'PROCESSING' }, { $set: { renderPlan } }).exec();
          if (saved.matchedCount !== 1) throw new Error('AI job lease was lost');
        }
        await setPhase('GENERATING');
        if (!claimed.providerJobId) {
          const marked = await this.jobs.updateOne({ _id: claimed._id, leaseId, state: 'PROCESSING',
            providerSubmitStartedAt: { $exists: false } }, { $set: { providerSubmitStartedAt: new Date() } }).exec();
          if (marked.matchedCount !== 1) throw new Error('AI image submission already started');
        }

        const result = await this.provider.runJob({
          jobId: String(claimed._id),
          type: claimed.type as 'TRY_ON' | 'MIX_MATCH',
          inputUrl,
          productImageUrls,
          providerJobId: claimed.providerJobId,
          prompt: renderPlan?.prompt,
          body: { heightCm: claimed.heightCm, weightKg: claimed.weightKg },
        });

        if (result.status === 'PROCESSING') {
          const providerJobId = result.providerJobId ?? claimed.providerJobId;
          if (!providerJobId || claimed.attempts >= 10) {
            await this.ai.failJob(String(claimed._id), providerJobId
              ? 'AI provider did not complete in time' : 'AI provider did not return a polling job ID', true, leaseId);
          } else {
            await this.jobs.updateOne({ _id: claimed._id, leaseId },
              { $set: { state: 'PENDING', nextAttemptAt: new Date(Date.now() + Math.min(claimed.attempts * 30_000, 300_000)),
                providerJobId },
                $unset: { leaseUntil: 1, leaseId: 1 } }).exec();
          }
          continue;
        }
        if (result.status === 'FAILED') {
          await this.ai.failJob(String(claimed._id), result.message, true, leaseId);
          continue;
        }

        if (!await this.jobs.exists({ _id: claimed._id, state: 'PROCESSING', leaseId })) continue;

        const ext = result.contentType === 'image/jpeg' ? 'jpg' : result.contentType === 'image/webp' ? 'webp' : 'png';
        const outputKey = `tryon/${claimed.ownerId}/${randomUUID()}.${ext}`;
        // Persist the cleanup deadline before writing to R2, so a crash cannot orphan the object.
        outputRecord = await this.media.create({
          key: outputKey,
          ownerId: String(claimed.ownerId),
          purpose: 'tryon',
          visibility: 'PRIVATE',
          status: 'PENDING',
          contentType: result.contentType,
          sizeBytes: result.outputBytes.length,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        });
        await this.uploadPrivate(outputKey, result.outputBytes, result.contentType);
        await this.media.updateOne({ _id: outputRecord._id, status: 'PENDING' }, { $set: { status: 'READY' } }).exec();
        if (!await this.ai.completeJob(String(claimed._id), outputKey, leaseId)) {
          await this.storage.deleteMediaRecord(outputRecord);
        }
      } catch (error) {
        this.logger.warn(`AI job ${claimed._id} failed: ${error instanceof Error ? error.message : 'unknown'}`);
        if (outputRecord) {
          try {
            const completed = await this.jobs.exists({ _id: claimed._id, state: 'COMPLETED', outputKeys: outputRecord.key });
            if (!completed) await this.storage.deleteMediaRecord(outputRecord);
          } catch (cleanupError) {
            this.logger.warn(`AI output cleanup deferred for ${outputRecord.key}: ${cleanupError instanceof Error ? cleanupError.message : 'unknown'}`);
          }
        }
        await this.ai.failJob(String(claimed._id), error instanceof FashionInputError ? error.message : 'Không thể phân tích hoặc tạo ảnh lúc này. Vui lòng thử lại.', true, leaseId);
      }
    }
  }

  private async uploadPrivate(key: string, body: Buffer, contentType: string) {
    const client = new S3Client({
      region: 'auto',
      endpoint: `https://${AppConfig.require('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: AppConfig.require('R2_ACCESS_KEY_ID'),
        secretAccessKey: AppConfig.require('R2_SECRET_ACCESS_KEY'),
      },
    });
    await client.send(new PutObjectCommand({
      Bucket: AppConfig.require('R2_PRIVATE_BUCKET'),
      Key: key,
      Body: body,
      ContentType: contentType,
    }));
  }
}
