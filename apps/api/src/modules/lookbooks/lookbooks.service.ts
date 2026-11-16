import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Model, Types, type ClientSession, type Connection } from 'mongoose';
import { withCommerceTransaction } from '../../common/mongo-transaction.util.js';
import { randomUUID } from 'node:crypto';
import { OutboxEvent } from '../operations/outbox-event.schema.js';
import { Lookbook } from './lookbook.schema.js';
import { Product } from '../catalog/product.schema.js';
import { MediaObject } from '../storage/media-object.schema.js';
import { StorageService } from '../storage/storage.service.js';
import { ProductVariant } from '../catalog/catalog.schemas.js';
import type { LookbookWriteDto } from './lookbooks.dto.js';

@Injectable()
export class LookbooksService {
  private readonly logger = new Logger(LookbooksService.name);
  constructor(
    @InjectModel(Lookbook.name) private readonly lookbooks: Model<Lookbook>,
    @InjectModel(Product.name) private readonly products: Model<Product>,
    @InjectModel(ProductVariant.name) private readonly variants: Model<ProductVariant>,
    @InjectModel(MediaObject.name) private readonly media: Model<MediaObject>,
    @InjectModel(OutboxEvent.name) private readonly outbox: Model<OutboxEvent>,
    @InjectConnection() private readonly connection: Connection,
    private readonly storage: StorageService,
  ) {}

  async listPublished() {
    const items = await this.lookbooks.find({ status: 'PUBLISHED' }).sort({ createdAt: -1 }).lean().exec();
    return { items: await Promise.all(items.map((item) => this.summary(item as unknown as Record<string, unknown>))) };
  }

  async listAdmin() {
    const items = await this.lookbooks.find().sort({ createdAt: -1 }).lean().exec();
    return { items: await Promise.all(items.map((item) => this.summary(item as unknown as Record<string, unknown>))) };
  }

  async getPublished(lookbookId: string) {
    if (!Types.ObjectId.isValid(lookbookId)) throw new NotFoundException('Lookbook not found');
    const item = await this.lookbooks.findOne({ _id: lookbookId, status: 'PUBLISHED' }).lean().exec();
    if (!item) throw new NotFoundException('Lookbook not found');
    return this.detail(item as unknown as Record<string, unknown>);
  }

  async getAdmin(lookbookId: string) {
    if (!Types.ObjectId.isValid(lookbookId)) throw new NotFoundException('Lookbook not found');
    const item = await this.lookbooks.findById(lookbookId).lean().exec();
    if (!item) throw new NotFoundException('Lookbook not found');
    return this.detail(item as unknown as Record<string, unknown>);
  }

  async create(dto: LookbookWriteDto) {
    await this.validateWrite(dto);
    const created = await withCommerceTransaction(this.connection, async (session) => {
      const [lookbook] = await this.lookbooks.create([{ ...dto, version: 1 }], { session });
      if (dto.status === 'PUBLISHED') {
        await this.enqueuePublished(String(lookbook._id), lookbook.title, lookbook.version ?? 1, session);
      }
      return lookbook;
    });
    await this.syncMediaPublication([String(created.mainMediaId)]);
    return this.detail(created.toObject() as unknown as Record<string, unknown>);
  }

  async update(lookbookId: string, dto: LookbookWriteDto) {
    if (!Types.ObjectId.isValid(lookbookId)) throw new NotFoundException('Lookbook not found');
    await this.validateWrite(dto);
    const updated = await withCommerceTransaction(this.connection, async (session) => {
      const previous = await this.lookbooks.findById(lookbookId).session(session).lean().exec();
      if (!previous) throw new NotFoundException('Lookbook not found');
      const changed = await this.lookbooks.findByIdAndUpdate(lookbookId,
        { $set: dto, $inc: { version: 1 } },
        { new: true, runValidators: true, session }).lean().exec();
      if (!changed) throw new NotFoundException('Lookbook not found');
      if (dto.status === 'PUBLISHED' && previous.status !== 'PUBLISHED') {
        await this.enqueuePublished(String(changed._id), changed.title, changed.version ?? 1, session);
      }
      return { changed, previousMediaId: String(previous.mainMediaId) };
    });
    await this.syncMediaPublication([updated.previousMediaId, String(updated.changed.mainMediaId)]);
    return this.detail(updated.changed as unknown as Record<string, unknown>);
  }

  private async enqueuePublished(lookbookId: string, title: string, version: number, session: ClientSession) {
    await this.outbox.create([{
      eventId: randomUUID(),
      type: 'lookbook.published',
      occurredAt: new Date(),
      aggregateType: 'lookbook',
      aggregateId: lookbookId,
      payload: { lookbookId, title, version },
    }], { session });
  }

  private async validateWrite(dto: LookbookWriteDto) {
    const media = await this.media.findOne({ _id: dto.mainMediaId, status: 'READY', purpose: 'lookbook' }).lean().exec();
    if (!media) throw new BadRequestException('Main lookbook media is unavailable');
    if (dto.status === 'PUBLISHED') {
      if (!dto.title?.trim()) throw new BadRequestException('Title is required to publish');
      if (!dto.items?.length) throw new BadRequestException('At least one product tag is required to publish');
    }
    const productIds = [...new Set(dto.items.map((item) => item.productId))];
    const publishedCount = await this.products.countDocuments({ _id: { $in: productIds }, status: 'PUBLISHED' }).exec();
    if (publishedCount !== productIds.length) throw new BadRequestException('One or more tagged products are unavailable');
  }

  private async summary(item: Record<string, unknown>) {
    const media = await this.media.findById(item.mainMediaId).lean().exec();
    return {
      id: String(item._id),
      title: item.title,
      description: item.description ?? '',
      status: item.status,
      mainMediaId: String(item.mainMediaId),
      tags: item.tags ?? [],
      version: item.version ?? 1,
      mainImageUrl: media ? await this.mediaUrl(media) : null,
    };
  }

  private async detail(item: Record<string, unknown>) {
    const media = await this.media.findById(item.mainMediaId).lean().exec();
    const items = (item.items as Array<{ productId: string; x: number; y: number }> | undefined) ?? [];
    const productIds = items.map((hotspot) => hotspot.productId);
    const products = productIds.length
      ? await this.products.find({ _id: { $in: productIds } }).lean().exec()
      : [];
    const variants = productIds.length
      ? await this.variants.find({ productId: { $in: productIds }, status: 'ACTIVE' }).lean().exec()
      : [];
    const productMap = new Map(products.map((p) => [String(p._id), p]));
    const stockByProduct = new Map<string, number>();
    for (const variant of variants) {
      const key = String(variant.productId);
      const available = Math.max(0, Number(variant.stockOnHand) - Number(variant.reserved ?? 0));
      stockByProduct.set(key, (stockByProduct.get(key) ?? 0) + available);
    }

    return {
      id: String(item._id),
      title: item.title,
      description: item.description ?? '',
      status: item.status,
      mainMediaId: String(item.mainMediaId),
      mainImageUrl: media ? await this.mediaUrl(media) : null,
      tags: item.tags ?? [],
      version: item.version ?? 1,
      items: items.map((hotspot) => {
        const product = productMap.get(String(hotspot.productId));
        const inStock = (stockByProduct.get(String(hotspot.productId)) ?? 0) > 0;
        return {
          productId: String(hotspot.productId),
          x: hotspot.x,
          y: hotspot.y,
          product: product ? {
            id: String(product._id),
            name: product.name,
            slug: product.slug,
            price: product.price,
            inStock,
            available: !product || product.status !== 'PUBLISHED' ? false : inStock,
          } : null,
        };
      }).filter((entry) => entry.product),
    };
  }

  private mediaUrl(media: { key: string; visibility: string }): Promise<string | null> | string | null {
    return media.visibility === 'PUBLIC'
      ? this.storage.publicUrl(media.key) ?? this.storage.signedReadUrl(media.key)
      : this.storage.signedReadUrl(media.key);
  }

  private async syncMediaPublication(ids: string[]): Promise<void> {
    try { await this.storage.reconcileMediaIds(ids); }
    catch (error) { this.logger.warn(`Lookbook media sync deferred: ${error instanceof Error ? error.message : 'unknown'}`); }
  }
}
