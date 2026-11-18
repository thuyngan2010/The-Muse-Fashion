import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Model, Types, type Connection } from 'mongoose';
import { ProductVariant } from '../catalog/catalog.schemas.js';
import { Product } from '../catalog/product.schema.js';
import { InventoryLedger } from './commerce.schemas.js';
import { PricingService } from './pricing.service.js';
import type { InventoryAdjustDto } from './commerce.dto.js';
import { withCommerceTransaction } from '../../common/mongo-transaction.util.js';
import { assertSameRequest, requestHash, requireIdempotencyKey } from '../../common/idempotency.util.js';
import { AuditService } from '../operations/audit.service.js';
import { UsersService } from '../users/users.service.js';

@Injectable()
export class InventoryService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(ProductVariant.name) private readonly variants: Model<ProductVariant>,
    @InjectModel(Product.name) private readonly products: Model<Product>,
    @InjectModel(InventoryLedger.name) private readonly ledger: Model<InventoryLedger>,
    private readonly pricing: PricingService,
    private readonly audit: AuditService,
    private readonly users: UsersService,
  ) {}

  async list() {
    const settings = await this.pricing.getSettings();
    const variants = await this.variants.find().sort({ sku: 1 }).lean().exec();
    const productIds = [...new Set(variants.map(variant => String(variant.productId)))];
    const products = await this.products.find({ _id: { $in: productIds } }).select('name').lean().exec();
    const names = new Map(products.map(product => [String(product._id), product.name]));
    return {
      items: variants.map((variant) => {
        const available = Math.max(0, variant.stockOnHand - variant.reserved);
        return {
          variantId: String(variant._id),
          sku: variant.sku,
          productName: names.get(String(variant.productId)) ?? 'Không rõ sản phẩm',
          stockOnHand: variant.stockOnHand,
          reserved: variant.reserved,
          available,
          version: variant.version ?? 1,
          lowStock: available <= settings.lowStockThreshold,
        };
      }),
    };
  }

  async listLedger(variantId?: string, page = 1, limit = 20) {
    if (variantId && !Types.ObjectId.isValid(variantId)) throw new BadRequestException('Invalid variantId');
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(50, Math.max(1, limit));
    const filter = variantId ? { variantId } : {};
    const [rows, total] = await Promise.all([
      this.ledger.find(filter).sort({ createdAt: -1 }).skip((safePage - 1) * safeLimit).limit(safeLimit).lean().exec(),
      this.ledger.countDocuments(filter).exec(),
    ]);
    const names = await this.users.displayNames(rows.map((row) => String(row.actorId)));
    return { page: safePage, limit: safeLimit, total, items: rows.map((row) => ({
      id: String(row._id), variantId: row.variantId ? String(row.variantId) : null,
      orderId: row.orderId ? String(row.orderId) : null, type: row.type, quantity: row.quantity,
      eventKey: row.eventKey, actorId: String(row.actorId), actorName: names.get(String(row.actorId)) ?? null, reason: row.reason,
    })) };
  }

  async adjust(actorId: string, idempotencyKey: string | undefined, dto: InventoryAdjustDto) {
    idempotencyKey = requireIdempotencyKey(idempotencyKey);
    if (!Types.ObjectId.isValid(dto.variantId)) throw new NotFoundException('Variant not found');

    const eventKey = `inventory.adjust:${idempotencyKey}`;
    const bodyHash = requestHash(dto);
    const replay = await this.ledger.findOne({ eventKey }).lean().exec();
    if (replay) return this.replayAdjustment(replay, actorId, bodyHash, dto);

    const replayed = await withCommerceTransaction(this.connection, async (session) => {
      const existing = await this.ledger.findOne({ eventKey }).session(session).lean().exec();
      if (existing) return existing;
      const updated = await this.variants.findOneAndUpdate(
      {
        _id: dto.variantId,
        version: dto.expectedVersion,
        $expr: {
          $and: [
            { $gte: [{ $add: ['$stockOnHand', dto.delta] }, '$reserved'] },
            { $gte: [{ $add: ['$stockOnHand', dto.delta] }, 0] },
          ],
        },
      },
      { $inc: { stockOnHand: dto.delta, version: 1 } },
      { new: true, session },
      ).exec();

    if (!updated) {
      const current = await this.variants.findById(dto.variantId).session(session).lean().exec();
      if (!current) throw new NotFoundException('Variant not found');
      if (current.version !== dto.expectedVersion) throw new ConflictException('Inventory version conflict');
      throw new BadRequestException('Adjustment would make available stock negative');
    }

      await this.ledger.create([{
        variantId: dto.variantId,
        quantity: dto.delta,
        type: 'MANUAL_ADJUST',
        eventKey,
        actorId,
        reason: dto.reason,
        requestHash: bodyHash,
      }], { session });
      await this.audit.record('inventory.adjust', 'product_variant', dto.variantId, actorId,
        { delta: dto.delta, reason: dto.reason }, session);
      return null;
    });
    if (replayed) return this.replayAdjustment(replayed, actorId, bodyHash, dto);
    return this.item(dto.variantId);
  }

  private async replayAdjustment(entry: InventoryLedger, actorId: string, bodyHash: string, dto: InventoryAdjustDto) {
    if (String(entry.actorId) !== actorId) {
      throw new ConflictException({ code: 'IDEMPOTENCY_CONFLICT', message: 'Idempotency-Key belongs to another actor' });
    }
    if (entry.requestHash) {
      assertSameRequest(entry.requestHash, bodyHash);
    } else if (String(entry.variantId) !== dto.variantId || entry.quantity !== dto.delta || entry.reason !== dto.reason) {
      throw new ConflictException({ code: 'IDEMPOTENCY_CONFLICT', message: 'Idempotency-Key was used with a different request' });
    }
    return this.item(String(entry.variantId));
  }

  private async item(variantId: string) {
    const variant = await this.variants.findById(variantId).lean().exec();
    if (!variant) throw new NotFoundException('Variant not found');
    const available = Math.max(0, variant.stockOnHand - variant.reserved);
    return {
      variantId: String(variant._id),
      sku: variant.sku,
      stockOnHand: variant.stockOnHand,
      reserved: variant.reserved,
      available,
      version: variant.version ?? 1,
    };
  }
}
