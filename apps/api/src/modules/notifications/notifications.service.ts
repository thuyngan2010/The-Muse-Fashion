import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Notification } from './notification.schema.js';

@Injectable()
export class NotificationsService {
  constructor(@InjectModel(Notification.name) private readonly notifications: Model<Notification>) {}

  async list(ownerId: string, page = 1, limit = 20) {
    const safeLimit = Math.min(50, Math.max(1, limit));
    const safePage = Math.max(1, page);
    const skip = (safePage - 1) * safeLimit;
    const [items, total, unreadCount] = await Promise.all([
      this.notifications.find({ ownerId }).sort({ createdAt: -1 }).skip(skip).limit(safeLimit).lean().exec(),
      this.notifications.countDocuments({ ownerId }).exec(),
      this.notifications.countDocuments({ ownerId, readAt: null }).exec(),
    ]);
    return {
      page: safePage,
      limit: safeLimit,
      total,
      unreadCount,
      items: items.map((item) => this.serialize(item)),
    };
  }

  async markRead(ownerId: string, notificationId: string) {
    if (!Types.ObjectId.isValid(notificationId)) throw new NotFoundException('Notification not found');
    const updated = await this.notifications.findOneAndUpdate(
      { _id: notificationId, ownerId },
      { $set: { readAt: new Date() } },
      { new: true },
    ).lean().exec();
    if (!updated) throw new NotFoundException('Notification not found');
    return this.serialize(updated);
  }

  async markAllRead(ownerId: string) {
    await this.notifications.updateMany({ ownerId, readAt: null }, { $set: { readAt: new Date() } }).exec();
    return { ok: true };
  }

  async createIdempotent(input: {
    ownerId: string;
    type: string;
    title: string;
    body: string;
    reference: Record<string, unknown>;
    dedupKey: string;
  }): Promise<void> {
    await this.notifications.updateOne(
      { dedupKey: input.dedupKey },
      {
        $setOnInsert: {
          ownerId: input.ownerId,
          type: input.type,
          title: input.title,
          body: input.body,
          reference: input.reference,
          dedupKey: input.dedupKey,
        },
      },
      { upsert: true },
    ).exec();
  }

  private serialize(item: Notification & { _id: unknown; createdAt?: Date }) {
    return {
      id: String(item._id),
      type: item.type,
      title: item.title,
      body: item.body,
      reference: item.reference,
      readAt: item.readAt?.toISOString() ?? null,
      createdAt: item.createdAt?.toISOString(),
    };
  }
}
