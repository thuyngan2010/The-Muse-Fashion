import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Order } from '../commerce/commerce.schemas.js';
import type { OrderLineSnapshot } from '../commerce/order.types.js';
import { MediaObject } from '../storage/media-object.schema.js';
import { StorageService } from '../storage/storage.service.js';
import type { ReviewWriteDto } from './community.dto.js';
import { assertSafeCommunityText } from './community-text.util.js';
import { Review } from './community.schemas.js';
import { withCommerceTransaction } from '../../common/mongo-transaction.util.js';
import { releaseCommunityMedia, retainCommunityMedia } from './community-media-retention.util.js';

@Injectable()
export class ReviewsService {
  constructor(
    @InjectModel(Review.name) private readonly reviews: Model<Review>,
    @InjectModel(Order.name) private readonly orders: Model<Order>,
    @InjectModel(MediaObject.name) private readonly media: Model<MediaObject>,
    private readonly storage: StorageService,
  ) {}

  async create(customerId: string, dto: ReviewWriteDto) {
    const content = assertSafeCommunityText('content', dto.content);
    const purchase = await this.resolveDeliveredLine(customerId, dto.orderItemId);
    const created = await withCommerceTransaction(this.reviews.db, async (session) => {
      const existing = await this.reviews.findOne({ customerId, orderItemId: dto.orderItemId }).session(session).exec();
      if (existing && !existing.deletedAt) throw new ConflictException('Review already exists for this order item');
      const mediaIds = await this.validateReviewMedia(customerId, dto.mediaIds ?? []);
      await retainCommunityMedia(this.media, mediaIds, session);
      if (existing) {
        const previousIds = existing.mediaIds.map(String);
        existing.stars = dto.stars;
        existing.content = content;
        existing.mediaIds = mediaIds;
        existing.status = 'PENDING_REVIEW';
        existing.deletedAt = undefined;
        await existing.save({ session });
        await releaseCommunityMedia(this.media, previousIds.filter(id => !mediaIds.includes(id)), session);
        return existing;
      }
      const [review] = await this.reviews.create([{
        orderItemId: dto.orderItemId, orderId: purchase.orderId, productId: purchase.line.productId,
        customerId, stars: dto.stars, content, mediaIds, status: 'PENDING_REVIEW',
      }], { session });
      return review;
    });
    return this.serialize(created.toObject() as unknown as Record<string, unknown>);
  }

  async listPublic(productId: string, page = 1, limit = 20) {
    if (!Types.ObjectId.isValid(productId)) throw new BadRequestException('Invalid productId');
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(50, Math.max(1, limit));
    const filter = { productId, status: 'PUBLIC', deletedAt: null };
    const [rows, total] = await Promise.all([
      this.reviews.find(filter).sort({ createdAt: -1 }).skip((safePage - 1) * safeLimit).limit(safeLimit).lean().exec(),
      this.reviews.countDocuments(filter).exec(),
    ]);
    return { page: safePage, limit: safeLimit, total,
      items: rows.map((row) => ({ id: String(row._id), productId: String(row.productId),
        stars: row.stars, content: row.content, mediaIds: row.mediaIds ?? [] })) };
  }

  async listOwned(customerId: string, reviewIds: string[]) {
    const rows = await this.reviews.find({ _id: { $in: reviewIds }, customerId, deletedAt: null }).lean().exec();
    return { items: await Promise.all(rows.map(row => this.serialize(row as unknown as Record<string, unknown>))) };
  }

  async listForOrder(customerId: string, orderId: string) {
    const order = await this.orders.exists({ _id: orderId, customerId }).exec();
    if (!order) throw new NotFoundException('Order not found');
    const rows = await this.reviews.find({ customerId, orderId, deletedAt: null }).lean().exec();
    return { items: await Promise.all(rows.map(row => this.serialize(row as unknown as Record<string, unknown>))) };
  }

  async update(customerId: string, reviewId: string, dto: ReviewWriteDto) {
    if (!Types.ObjectId.isValid(reviewId)) throw new NotFoundException('Review not found');
    await this.resolveDeliveredLine(customerId, dto.orderItemId);
    const content = assertSafeCommunityText('content', dto.content);
    const review = await withCommerceTransaction(this.reviews.db, async (session) => {
      const current = await this.reviews.findById(reviewId).session(session).exec();
      if (!current || current.deletedAt) throw new NotFoundException('Review not found');
      if (String(current.customerId) !== customerId) throw new ForbiddenException('Cannot modify another user review');
      if (String(current.orderItemId) !== dto.orderItemId) throw new BadRequestException('orderItemId cannot be changed');
      const mediaIds = await this.validateReviewMedia(customerId, dto.mediaIds ?? []);
      await retainCommunityMedia(this.media, mediaIds, session);
      const previousIds = current.mediaIds.map(String);
      current.stars = dto.stars;
      current.content = content;
      current.mediaIds = mediaIds;
      current.status = 'PENDING_REVIEW';
      await current.save({ session });
      await releaseCommunityMedia(this.media, previousIds.filter(id => !mediaIds.includes(id)), session);
      return current;
    });
    return this.serialize(review.toObject() as unknown as Record<string, unknown>);
  }

  async delete(customerId: string, reviewId: string): Promise<void> {
    if (!Types.ObjectId.isValid(reviewId)) throw new NotFoundException('Review not found');
    await withCommerceTransaction(this.reviews.db, async (session) => {
      const review = await this.reviews.findById(reviewId).session(session).exec();
      if (!review || review.deletedAt) throw new NotFoundException('Review not found');
      if (String(review.customerId) !== customerId) throw new ForbiddenException('Cannot modify another user review');
      review.status = 'HIDDEN';
      review.deletedAt = new Date();
      await review.save({ session });
      await releaseCommunityMedia(this.media, review.mediaIds.map(String), session);
    });
  }

  private async resolveDeliveredLine(customerId: string, orderItemId: string) {
    if (!Types.ObjectId.isValid(orderItemId)) throw new BadRequestException('Invalid order item');
    const orders = await this.orders.find({ customerId, state: 'DELIVERED' }).lean().exec();
    for (const order of orders) {
      const lines = (order.items as OrderLineSnapshot[]) ?? [];
      const line = lines.find((entry) => entry.lineId === orderItemId || String((entry as { _id?: string })._id) === orderItemId);
      if (line) {
        return { orderId: String(order._id), line };
      }
    }
    throw new BadRequestException('Order item is not eligible for review');
  }

  private async validateReviewMedia(customerId: string, mediaIds: string[]) {
    if (!mediaIds.length) return [];
    const records = await this.media.find({ _id: { $in: mediaIds } }).lean().exec();
    if (records.length !== mediaIds.length) throw new BadRequestException('One or more review images are unavailable');
    for (const record of records) {
      if (record.status !== 'READY') throw new BadRequestException('One or more review images are unavailable');
      if (record.purpose !== 'community') {
        throw new BadRequestException('Invalid review image purpose');
      }
      if (String(record.ownerId) !== customerId) throw new ForbiddenException('Review image ownership mismatch');
    }
    return mediaIds;
  }

  private async serialize(review: Record<string, unknown>) {
    const mediaIds = (review.mediaIds as string[] | undefined) ?? [];
    const media = mediaIds.length
      ? await this.media.find({ _id: { $in: mediaIds } }).lean().exec()
      : [];
    return {
      id: String(review._id),
      orderItemId: String(review.orderItemId),
      customerId: String(review.customerId),
      stars: review.stars,
      content: review.content,
      mediaIds,
      mediaUrls: (await Promise.all(media.map((item) => this.storage.signedReadUrl(item.key)))).filter(Boolean),
      status: review.status,
      createdAt: (review.createdAt as Date | undefined)?.toISOString(),
    };
  }
}
