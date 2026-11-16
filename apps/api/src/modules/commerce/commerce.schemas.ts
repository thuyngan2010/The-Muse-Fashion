import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes } from 'mongoose';

@Schema({ timestamps: true, collection: 'carts' })
export class Cart {
  @Prop({ type: SchemaTypes.ObjectId, required: true, unique: true }) customerId!: string;
  @Prop({ type: [{ variantId: { type: SchemaTypes.ObjectId, required: true }, quantity: { type: Number, required: true, min: 1, max: 99 } }], default: [] })
  items!: Array<{ variantId: string; quantity: number }>;
}
export const CartSchema = SchemaFactory.createForClass(Cart);

@Schema({ timestamps: true, collection: 'checkout_quotes' })
export class CheckoutQuote {
  @Prop({ type: String, required: true, unique: true }) quoteId!: string;
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true }) customerId!: string;
  @Prop({ type: SchemaTypes.ObjectId, required: true }) addressId!: string;
  @Prop({ type: String }) voucherCode?: string;
  @Prop({ type: String, required: true }) cartFingerprint!: string;
  @Prop({ type: [{ variantId: { type: SchemaTypes.ObjectId, required: true }, quantity: { type: Number, required: true } }], required: true })
  cartItems!: Array<{ variantId: string; quantity: number }>;
  @Prop({ type: Number, required: true }) subtotal!: number;
  @Prop({ type: Number, required: true }) shippingFee!: number;
  @Prop({ type: Number, required: true }) voucherDiscount!: number;
  @Prop({ type: Number, required: true }) payableTotal!: number;
  @Prop({ type: Date, required: true, index: true }) expiresAt!: Date;
  @Prop({ type: Date }) consumedAt?: Date;
}
export const CheckoutQuoteSchema = SchemaFactory.createForClass(CheckoutQuote);

@Schema({ timestamps: true, collection: 'orders' })
export class Order {
  @Prop({ type: String, required: true, unique: true }) code!: string;
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true }) customerId!: string;
  @Prop({ type: [Object], required: true }) items!: Array<Record<string, unknown>>;
  @Prop({ type: Object, required: true }) money!: Record<string, number>;
  @Prop({ type: Object, required: true }) shippingSnapshot!: Record<string, unknown>;
  @Prop({ type: String, required: true, index: true }) state!: string;
  @Prop({ type: Date, index: true }) paymentDueAt?: Date;
  @Prop({ type: String, required: true }) idempotencyKey!: string;
  @Prop({ type: String }) requestHash?: string;
  @Prop({ type: String }) cancelIdempotencyKey?: string;
  @Prop({ type: String }) cancelRequestHash?: string;
  @Prop({ type: SchemaTypes.ObjectId, index: true }) assignedStaffId?: string;
  @Prop({ type: String }) voucherCode?: string;
  @Prop({ type: Number, default: 1, min: 1 }) version!: number;
  @Prop({ type: Number, default: 0, min: 0 }) paymentAttemptRevision!: number;
}
export const OrderSchema = SchemaFactory.createForClass(Order);
OrderSchema.index({ customerId: 1, idempotencyKey: 1 }, { unique: true });
OrderSchema.index({ customerId: 1, createdAt: -1 });
OrderSchema.index({ state: 1, paymentDueAt: 1 });

@Schema({ timestamps: true, collection: 'order_events' })
export class OrderEvent {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true }) orderId!: string;
  @Prop({ type: String }) from?: string;
  @Prop({ type: String, required: true }) to!: string;
  @Prop({ type: SchemaTypes.ObjectId, required: true }) actorId!: string;
  @Prop({ type: String }) reason?: string;
}
export const OrderEventSchema = SchemaFactory.createForClass(OrderEvent);

@Schema({ timestamps: true, collection: 'inventory_ledger' })
export class InventoryLedger {
  @Prop({ type: SchemaTypes.ObjectId, index: true }) variantId?: string;
  @Prop({ type: SchemaTypes.ObjectId, index: true }) orderId?: string;
  @Prop({ type: Number, required: true }) quantity!: number;
  @Prop({ type: String, required: true }) type!: string;
  @Prop({ type: String, required: true, unique: true }) eventKey!: string;
  @Prop({ type: SchemaTypes.ObjectId, required: true }) actorId!: string;
  @Prop({ type: String, required: true }) reason!: string;
  @Prop({ type: String }) requestHash?: string;
}
export const InventoryLedgerSchema = SchemaFactory.createForClass(InventoryLedger);

@Schema({ timestamps: true, collection: 'vouchers' })
export class Voucher {
  @Prop({ type: String, required: true, unique: true, uppercase: true, trim: true }) code!: string;
  @Prop({ type: String, enum: ['FIXED', 'PERCENT'], required: true }) type!: string;
  @Prop({ type: Number, required: true, min: 1 }) value!: number;
  @Prop({ type: Number, default: null }) maxDiscount?: number | null;
  @Prop({ type: Number, required: true, min: 0, default: 0 }) minimumSubtotal!: number;
  @Prop({ type: Date, required: true }) validFrom!: Date;
  @Prop({ type: Date, required: true }) validTo!: Date;
  @Prop({ type: Number, required: true, min: 1 }) usageLimit!: number;
  @Prop({ type: Number, min: 0, default: 0 }) usedCount!: number;
  @Prop({ type: String, enum: ['ACTIVE', 'DISABLED'], default: 'ACTIVE', index: true }) status!: string;
}
export const VoucherSchema = SchemaFactory.createForClass(Voucher);

@Schema({ timestamps: true, collection: 'shipments' })
export class Shipment {
  @Prop({ type: SchemaTypes.ObjectId, required: true, unique: true }) orderId!: string;
  @Prop({ type: String }) carrier?: string;
  @Prop({ type: String }) trackingCode?: string;
  @Prop({ type: String, required: true, index: true }) status!: string;
  @Prop({ type: [Object], default: [] }) events!: Array<Record<string, unknown>>;
}
export const ShipmentSchema = SchemaFactory.createForClass(Shipment);
