import { ConflictException, Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Model, type Connection, type ClientSession } from 'mongoose';
import { ProductVariant } from '../catalog/catalog.schemas.js';
import { InventoryLedger, Voucher } from './commerce.schemas.js';
import type { OrderLineSnapshot } from './order.types.js';

@Injectable()
export class InventoryReservationService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(ProductVariant.name) private readonly variants: Model<ProductVariant>,
    @InjectModel(InventoryLedger.name) private readonly ledger: Model<InventoryLedger>,
    @InjectModel(Voucher.name) private readonly vouchers: Model<Voucher>,
  ) {}

  get connectionRef(): Connection {
    return this.connection;
  }

  async reserveLines(
    lines: OrderLineSnapshot[],
    orderId: string,
    actorId: string,
    session: ClientSession,
  ): Promise<void> {
    for (const line of lines) {
      const updated = await this.variants
        .findOneAndUpdate(
          {
            _id: line.variantId,
            $expr: { $gte: [{ $subtract: ['$stockOnHand', '$reserved'] }, line.quantity] },
          },
          { $inc: { reserved: line.quantity, version: 1 } },
          { new: true, session },
        )
        .exec();
      if (!updated) throw new ConflictException({ code: 'OUT_OF_STOCK', message: 'Requested quantity exceeds available stock' });

      await this.ledger.create(
        [{
          variantId: line.variantId,
          orderId,
          quantity: line.quantity,
          type: 'RESERVE',
          eventKey: `inventory.reserve:${orderId}:${line.variantId}`,
          actorId,
          reason: 'Order checkout reservation',
        }],
        { session },
      );
    }
  }

  async releaseLines(
    orderId: string,
    lines: OrderLineSnapshot[],
    actorId: string,
    reason: string,
    session: ClientSession,
  ): Promise<void> {
    for (const line of lines) {
      const eventKey = `inventory.release:${orderId}:${line.variantId}`;
      const existing = await this.ledger.findOne({ eventKey }).session(session).lean().exec();
      if (existing) continue;

      const released = await this.variants
        .updateOne(
          { _id: line.variantId, reserved: { $gte: line.quantity } },
          { $inc: { reserved: -line.quantity, version: 1 } },
          { session },
        )
        .exec();
      if (released.modifiedCount !== 1) throw new ConflictException('Reserved stock cannot be released');

      await this.ledger.create(
        [{
          variantId: line.variantId,
          orderId,
          quantity: -line.quantity,
          type: 'RELEASE',
          eventKey,
          actorId,
          reason,
        }],
        { session },
      );
    }
  }

  async commitLines(orderId: string, lines: OrderLineSnapshot[], actorId: string, session: ClientSession): Promise<void> {
    for (const line of lines) {
      const eventKey = `inventory.sale:${orderId}:${line.variantId}`;
      if (await this.ledger.findOne({ eventKey }).session(session).lean().exec()) continue;
      const updated = await this.variants.updateOne(
        { _id: line.variantId, reserved: { $gte: line.quantity }, stockOnHand: { $gte: line.quantity } },
        { $inc: { reserved: -line.quantity, stockOnHand: -line.quantity, version: 1 } },
        { session },
      ).exec();
      if (updated.modifiedCount !== 1) throw new ConflictException('Reserved stock cannot be finalized');
      await this.ledger.create([{ variantId: line.variantId, orderId, quantity: -line.quantity,
        type: 'SALE', eventKey, actorId, reason: 'Order delivered' }], { session });
    }
  }

  async consumeVoucherUsage(code: string, subtotal: number, session: ClientSession): Promise<void> {
    const now = new Date();
    const updated = await this.vouchers
      .findOneAndUpdate(
        {
          code: code.toUpperCase(),
          status: 'ACTIVE',
          validFrom: { $lte: now },
          validTo: { $gte: now },
          minimumSubtotal: { $lte: subtotal },
          $expr: { $lt: ['$usedCount', '$usageLimit'] },
        },
        { $inc: { usedCount: 1 } },
        { new: true, session },
      )
      .exec();
    if (!updated) throw new ConflictException('Voucher is no longer available');
  }

  async releaseVoucherUsage(
    orderId: string,
    code: string | undefined,
    actorId: string,
    session: ClientSession,
  ): Promise<void> {
    if (!code) return;
    const eventKey = `voucher.release:${orderId}`;
    const existing = await this.ledger.findOne({ eventKey }).session(session).lean().exec();
    if (existing) return;

    const released = await this.vouchers
      .updateOne({ code: code.toUpperCase(), usedCount: { $gt: 0 } }, { $inc: { usedCount: -1 } }, { session })
      .exec();
    if (released.modifiedCount !== 1) throw new ConflictException('Voucher usage cannot be released');

    await this.ledger.create(
      [{
        orderId,
        quantity: 0,
        type: 'VOUCHER_RELEASE',
        eventKey,
        actorId,
        reason: `Release voucher ${code} for order ${orderId}`,
      }],
      { session },
    );
  }
}
