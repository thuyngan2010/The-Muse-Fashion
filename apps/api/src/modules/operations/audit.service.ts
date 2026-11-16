import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, type ClientSession } from 'mongoose';
import { AuditLog } from './audit.schema.js';

@Injectable()
export class AuditService {
  constructor(@InjectModel(AuditLog.name) private readonly logs: Model<AuditLog>) {}

  async record(action: string, entityType: string, entityId: string, actorId?: string, metadata: Record<string, unknown> = {}, session?: ClientSession): Promise<void> {
    await this.logs.create([{ action, entityType, entityId, actorId, metadata }], session ? { session } : {});
  }

  async list(entityType?: string, entityId?: string, page = 1, limit = 20) {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(50, Math.max(1, limit));
    const filter = { ...(entityType ? { entityType } : {}), ...(entityId ? { entityId } : {}) };
    const [items, total] = await Promise.all([
      this.logs.find(filter).sort({ createdAt: -1 }).skip((safePage - 1) * safeLimit).limit(safeLimit).lean().exec(),
      this.logs.countDocuments(filter).exec(),
    ]);
    return { page: safePage, limit: safeLimit, total, items: items.map((row) => ({
      id: String(row._id), actorId: row.actorId ? String(row.actorId) : null,
      action: row.action, entityType: row.entityType, entityId: row.entityId,
      metadata: row.metadata, createdAt: (row as typeof row & { createdAt?: Date }).createdAt,
    })) };
  }
}
