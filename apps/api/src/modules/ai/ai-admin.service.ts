import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Product } from '../catalog/product.schema.js';
import { User } from '../users/user.schema.js';
import { AiJob } from './ai.schemas.js';

export const AI_JOB_STATES = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'EXPIRED'] as const;
const ERROR_MAX_LENGTH = 200;
const STATS_WINDOW_MS = 24 * 60 * 60 * 1000;

function shorten(message: unknown): string | null {
  if (typeof message !== 'string' || !message.trim()) return null;
  const text = message.trim();
  return text.length > ERROR_MAX_LENGTH ? `${text.slice(0, ERROR_MAX_LENGTH - 1)}…` : text;
}

/**
 * Theo dõi tác vụ AI cho quản trị. Chủ ý không trả: đường dẫn/khóa ảnh gốc của khách,
 * kế hoạch dựng (prompt), chiều cao và cân nặng.
 */
@Injectable()
export class AiAdminService {
  constructor(
    @InjectModel(AiJob.name) private readonly jobs: Model<AiJob>,
    @InjectModel(User.name) private readonly users: Model<User>,
    @InjectModel(Product.name) private readonly products: Model<Product>,
  ) {}

  async list(page = 1, limit = 20, filter: { type?: string; state?: string } = {}) {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(50, Math.max(1, limit));
    const query: Record<string, unknown> = {};
    if (filter.type) query.type = filter.type;
    if (filter.state) query.state = filter.state;
    const [rows, total] = await Promise.all([
      this.jobs.find(query).sort({ createdAt: -1 }).skip((safePage - 1) * safeLimit).limit(safeLimit).lean().exec(),
      this.jobs.countDocuments(query).exec(),
    ]);
    return { page: safePage, limit: safeLimit, total, items: await this.serialize(rows as unknown as Array<Record<string, unknown>>) };
  }

  async detail(jobId: string) {
    if (!Types.ObjectId.isValid(jobId)) throw new NotFoundException('AI job not found');
    const row = await this.jobs.findById(jobId).lean().exec();
    if (!row) throw new NotFoundException('AI job not found');
    const [item] = await this.serialize([row as unknown as Record<string, unknown>]);
    return item;
  }

  async stats() {
    const since = new Date(Date.now() - STATS_WINDOW_MS);
    const [stateRows, timing] = await Promise.all([
      this.jobs.aggregate<{ _id: string; count: number }>([{ $group: { _id: '$state', count: { $sum: 1 } } }]).exec(),
      this.jobs.aggregate<{ avg: number | null; count: number }>([
        { $match: { state: 'COMPLETED', terminalAt: { $gte: since }, startedAt: { $exists: true } } },
        { $group: { _id: null, avg: { $avg: { $subtract: ['$terminalAt', '$startedAt'] } }, count: { $sum: 1 } } },
      ]).exec(),
    ]);
    const byState: Record<string, number> = Object.fromEntries(AI_JOB_STATES.map((s) => [s, 0]));
    for (const row of stateRows) byState[row._id] = row.count;
    const total = Object.values(byState).reduce((sum, n) => sum + n, 0);
    const avg = timing[0]?.avg;
    return {
      total,
      byState,
      avgProcessingMs: typeof avg === 'number' ? Math.round(avg) : null,
      avgSampleSize: timing[0]?.count ?? 0,
      windowHours: 24,
    };
  }

  private async serialize(rows: Array<Record<string, unknown>>) {
    const ownerIds = [...new Set(rows.map((row) => String(row.ownerId)))];
    const productIds = [...new Set(rows.flatMap((row) => ((row.productIds as unknown[] | undefined) ?? []).map(String)))];
    const [owners, products] = await Promise.all([
      ownerIds.length ? this.users.find({ _id: { $in: ownerIds } }).select('fullName email').lean().exec() : Promise.resolve([]),
      productIds.length ? this.products.find({ _id: { $in: productIds } }).select('name').lean().exec() : Promise.resolve([]),
    ]);
    const ownerById = new Map(owners.map((owner) => [String(owner._id), owner]));
    const productById = new Map(products.map((product) => [String(product._id), product]));
    return rows.map((row) => {
      const startedAt = row.startedAt as Date | undefined;
      const terminalAt = row.terminalAt as Date | undefined;
      const owner = ownerById.get(String(row.ownerId));
      return {
        id: String(row._id),
        customerId: String(row.ownerId),
        customerName: owner?.fullName ?? null,
        customerEmail: owner?.email ?? null,
        type: row.type as string,
        productNames: ((row.productIds as unknown[] | undefined) ?? [])
          .map((id) => productById.get(String(id))?.name).filter((name): name is string => Boolean(name)),
        state: row.state as string,
        phase: (row.phase as string | undefined) ?? null,
        createdAt: (row.createdAt as Date | undefined)?.toISOString(),
        startedAt: startedAt?.toISOString() ?? null,
        /** Thời điểm tác vụ chạm trạng thái cuối (hoàn thành hoặc thất bại). */
        completedAt: terminalAt?.toISOString() ?? null,
        processingMs: startedAt && terminalAt ? Math.max(0, terminalAt.getTime() - startedAt.getTime()) : null,
        errorMessage: shorten(row.errorMessage),
        attempts: Number(row.attempts ?? 0),
        quotaRefunded: Boolean(row.quotaRefunded),
      };
    });
  }
}
