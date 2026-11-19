import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Model, Types, type Connection } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { Product } from '../catalog/product.schema.js';
import { Category } from '../catalog/catalog.schemas.js';
import { MediaObject } from '../storage/media-object.schema.js';
import { StorageService } from '../storage/storage.service.js';
import type { AiJobWriteDto } from './ai.dto.js';
import { AiConsent, AiJob } from './ai.schemas.js';
import { AiQuotaService } from './ai-quota.service.js';
import { AiProviderService } from './ai-provider.service.js';
import { OutboxEvent } from '../operations/outbox-event.schema.js';
import { withCommerceTransaction } from '../../common/mongo-transaction.util.js';
import { detectGarmentSlot, findOutfitConflict } from './garment-slot.js';

const INPUT_RETENTION_MS = 24 * 60 * 60 * 1000;
const OUTPUT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class AiService {
  constructor(
    @InjectModel(AiJob.name) private readonly jobs: Model<AiJob>,
    @InjectModel(AiConsent.name) private readonly consents: Model<AiConsent>,
    @InjectModel(Product.name) private readonly products: Model<Product>,
    @InjectModel(MediaObject.name) private readonly media: Model<MediaObject>,
    private readonly quota: AiQuotaService,
    private readonly provider: AiProviderService,
    private readonly storage: StorageService,
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(OutboxEvent.name) private readonly outbox: Model<OutboxEvent>,
    // Để cuối và không bắt buộc: chỗ nào tạo service theo thứ tự tham số cũ vẫn chạy (khi đó chỉ xét tên sản phẩm).
    @InjectModel(Category.name) private readonly categories?: Model<Category>,
  ) {}

  async createTryOn(ownerId: string, idempotencyKey: string | undefined, dto: AiJobWriteDto) {
    return this.createJob(ownerId, 'TRY_ON', idempotencyKey, dto, 1, 1);
  }

  async createMixMatch(ownerId: string, idempotencyKey: string | undefined, dto: AiJobWriteDto) {
    return this.createJob(ownerId, 'MIX_MATCH', idempotencyKey, dto, 2, 5);
  }

  async getJob(ownerId: string, jobId: string) {
    if (!Types.ObjectId.isValid(jobId)) throw new NotFoundException('AI job not found');
    const job = await this.jobs.findById(jobId).lean().exec();
    if (!job || String(job.ownerId) !== ownerId) throw new NotFoundException('AI job not found');
    return this.serializeJob(job as unknown as Record<string, unknown>);
  }

  async listJobs(ownerId: string, page = 1, limit = 20) {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(50, Math.max(1, limit));
    const [rows, total] = await Promise.all([
      this.jobs.find({ ownerId }).sort({ createdAt: -1 }).skip((safePage - 1) * safeLimit).limit(safeLimit).lean().exec(),
      this.jobs.countDocuments({ ownerId }).exec(),
    ]);
    return { page: safePage, limit: safeLimit, total,
      items: await Promise.all(rows.map((row) => this.serializeJob(row as unknown as Record<string, unknown>))) };
  }

  private async createJob(
    ownerId: string,
    type: 'TRY_ON' | 'MIX_MATCH',
    idempotencyKey: string | undefined,
    dto: AiJobWriteDto,
    minProducts: number,
    maxProducts: number,
  ) {
    if (!this.provider.isEnabled()) {
      throw new ServiceUnavailableException('AI experiences are not enabled');
    }
    if (!idempotencyKey?.trim()) throw new BadRequestException('Idempotency-Key header is required');
    if (dto.productIds.length < minProducts || dto.productIds.length > maxProducts) {
      throw new BadRequestException(`Select between ${minProducts} and ${maxProducts} products`);
    }

    const replay = await this.jobs.findOne({ idempotencyKey: idempotencyKey.trim() }).lean().exec();
    if (replay) {
      if (String(replay.ownerId) !== ownerId) throw new ForbiddenException('Idempotency key belongs to another user');
      this.assertMatchingReplay(replay, type, dto);
      return this.serializeJob(replay as unknown as Record<string, unknown>);
    }

    await this.validateInput(ownerId, dto);
    // Chặn bộ phối sai (2 quần, đầm + áo...) trước khi lưu job: không trừ lượt, không gọi AI.
    if (type === 'MIX_MATCH') await this.assertOutfitRules(dto.productIds);

    const quotaEventKey = `ai:${ownerId}:${idempotencyKey.trim()}`;

    let job;
    try {
      job = await withCommerceTransaction(this.connection, async (session) => {
        const input = await this.media.findOne({ _id: dto.inputMediaId, ownerId, purpose: 'tryon', status: 'READY', cleanupClaimedAt: { $exists: false } })
          .session(session).lean().exec();
        if (!input?.key || (input.expiresAt && input.expiresAt <= new Date())) throw new BadRequestException('Input photo is unavailable');
        const { windowStart } = await this.quota.reserve(ownerId, session);
        const [created] = await this.jobs.create([{
          ownerId, type, productIds: dto.productIds, inputMediaId: dto.inputMediaId,
          style: dto.style,
          heightCm: dto.heightCm, weightKg: dto.weightKg,
          inputKeys: [input.key], outputKeys: [], state: 'PENDING', quotaCharged: true,
          quotaRefunded: false, quotaEventKey, idempotencyKey: idempotencyKey.trim(),
          consentPolicyVersion: dto.consentPolicyVersion.trim(), quotaWindowStart: windowStart,
          expiresAt: new Date(Date.now() + OUTPUT_RETENTION_MS),
        }], { session });
        await this.consents.create([{ ownerId, policyVersion: dto.consentPolicyVersion.trim(),
          jobId: String(created._id), acceptedAt: new Date() }], { session });
        await this.media.updateOne({ _id: input._id, purpose: 'tryon' },
          { $set: { expiresAt: new Date(Date.now() + OUTPUT_RETENTION_MS) } }, { session }).exec();
        return created;
      });
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
        const winner = await this.jobs.findOne({ idempotencyKey: idempotencyKey.trim() }).lean().exec();
        if (winner && String(winner.ownerId) === ownerId) {
          this.assertMatchingReplay(winner, type, dto);
          return this.serializeJob(winner as unknown as Record<string, unknown>);
        }
        if (winner) throw new ForbiddenException('Idempotency key belongs to another user');
      }
      throw error;
    }

    return this.serializeJob(job.toObject() as unknown as Record<string, unknown>);
  }

  private assertMatchingReplay(job: AiJob, type: 'TRY_ON' | 'MIX_MATCH', dto: AiJobWriteDto): void {
    if (job.type !== type || String(job.inputMediaId) !== dto.inputMediaId
      || job.consentPolicyVersion !== dto.consentPolicyVersion.trim()
      || job.style !== dto.style
      || (job.heightCm ?? undefined) !== dto.heightCm
      || (job.weightKg ?? undefined) !== dto.weightKg
      || job.productIds.length !== dto.productIds.length
      || job.productIds.some((id, index) => String(id) !== dto.productIds[index])) {
      throw new ConflictException('Idempotency key was used with a different AI request');
    }
  }

  private async validateInput(ownerId: string, dto: AiJobWriteDto) {
    const media = await this.media.findById(dto.inputMediaId).lean().exec();
    if (!media || media.status !== 'READY' || media.cleanupClaimedAt || media.purpose !== 'tryon' || (media.expiresAt && media.expiresAt <= new Date())) {
      throw new BadRequestException('Input photo is unavailable');
    }
    if (String(media.ownerId) !== ownerId) throw new ForbiddenException('Input photo ownership mismatch');

    const published = await this.products.countDocuments({
      _id: { $in: dto.productIds },
      status: 'PUBLISHED',
    }).exec();
    if (published !== dto.productIds.length) {
      throw new BadRequestException('One or more products are unavailable');
    }
  }

  private async assertOutfitRules(productIds: string[]) {
    const rows = await this.products.find({ _id: { $in: productIds } }).select('name categoryId').lean().exec();
    const categoryIds = [...new Set(rows.map((row) => row.categoryId).filter(Boolean).map(String))];
    const categoryRows = categoryIds.length && this.categories
      ? await this.categories.find({ _id: { $in: categoryIds } }).select('name').lean().exec() : [];
    const categoryById = new Map(categoryRows.map((row) => [String(row._id), row.name]));
    const slots = productIds.map((id) => {
      const product = rows.find((row) => String(row._id) === String(id));
      return detectGarmentSlot(product?.categoryId ? categoryById.get(String(product.categoryId)) : null, product?.name).slot;
    });
    const conflict = findOutfitConflict(slots);
    if (conflict) throw new BadRequestException(conflict);
  }

  async failJob(jobId: string, message: string, refund = true, leaseId?: string): Promise<void> {
    const job = await withCommerceTransaction(this.connection, async (session) => {
      const failed = await this.jobs.findOneAndUpdate(
        { _id: jobId, state: { $in: ['PENDING', 'PROCESSING'] }, ...(leaseId ? { leaseId } : {}) },
        {
          $set: {
            state: 'FAILED',
            phase: 'FAILED',
            errorMessage: message,
            terminalAt: new Date(),
            expiresAt: new Date(Date.now() + OUTPUT_RETENTION_MS),
          },
          $unset: { leaseUntil: 1, leaseId: 1, nextAttemptAt: 1 },
        },
        { new: true, session },
      ).exec();
      if (!failed) return null;
      if (refund && failed.quotaCharged && !failed.quotaRefunded) {
        const refunded = await this.jobs.updateOne(
          { _id: jobId, quotaRefunded: { $ne: true } },
          { $set: { quotaRefunded: true } },
          { session },
        ).exec();
        if (refunded.modifiedCount === 1) await this.quota.release(String(failed.ownerId), failed.quotaWindowStart, session);
      }
      return failed;
    });
    if (!job) return;
    await this.scheduleInputExpiry(job.inputKeys);
  }

  async completeJob(jobId: string, outputKey: string, leaseId?: string): Promise<boolean> {
    const terminalAt = new Date();
    const completed = await withCommerceTransaction(this.connection, async (session) => {
      const job = await this.jobs.findOneAndUpdate(
        { _id: jobId, state: 'PROCESSING', ...(leaseId ? { leaseId } : {}) },
        { $set: { state: 'COMPLETED', phase: 'COMPLETED', outputKeys: [outputKey], terminalAt,
          expiresAt: new Date(terminalAt.getTime() + OUTPUT_RETENTION_MS) },
          $unset: { leaseUntil: 1, leaseId: 1, nextAttemptAt: 1 } },
        { session, new: true },
      ).exec();
      if (!job) return false;
      await this.outbox.create([{ eventId: randomUUID(), type: 'ai.job.completed', occurredAt: terminalAt,
        aggregateType: 'ai_job', aggregateId: jobId,
        payload: { jobId, ownerId: String(job.ownerId), expiresAt: job.expiresAt?.toISOString() } }], { session });
      return true;
    });
    if (!completed) return false;
    const job = await this.jobs.findById(jobId).lean().exec();
    if (job) await this.scheduleInputExpiry(job.inputKeys);
    await this.media.updateOne(
      { key: outputKey },
      { $set: { expiresAt: new Date(terminalAt.getTime() + OUTPUT_RETENTION_MS) } },
    ).exec();
    return true;
  }

  private async scheduleInputExpiry(keys: string[]) {
    if (!keys.length) return;
    const expiresAt = new Date(Date.now() + INPUT_RETENTION_MS);
    await this.media.updateMany({ key: { $in: keys } }, { $set: { expiresAt } }).exec();
  }

  private async serializeJob(job: Record<string, unknown>) {
    const state = String(job.state);
    const outputKeys = (job.outputKeys as string[] | undefined) ?? [];
    const expiresAt = job.expiresAt as Date | undefined;
    const resultUrls = state === 'COMPLETED' && expiresAt && expiresAt > new Date()
      ? (await Promise.all(outputKeys.map((key) => this.storage.signedReadUrl(key)))).filter(Boolean)
      : [];

    return {
      id: String(job._id),
      createdAt: (job.createdAt as Date | undefined)?.toISOString(),
      type: job.type,
      state,
      phase: job.phase ?? (state === 'COMPLETED' ? 'COMPLETED' : state === 'FAILED' ? 'FAILED' : 'QUEUED'),
      planSummary: (job.renderPlan as { summary?: string } | undefined)?.summary ?? null,
      detectedItems: (job.renderPlan as { detectedItems?: unknown[] } | undefined)?.detectedItems ?? [],
      quotaCharged: Boolean(job.quotaCharged),
      resultUrls,
      errorMessage: job.errorMessage ?? null,
      expiresAt: expiresAt?.toISOString() ?? new Date(Date.now() + OUTPUT_RETENTION_MS).toISOString(),
    };
  }
}
