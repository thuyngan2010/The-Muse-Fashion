import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Model, Types, type Connection } from 'mongoose';
import { randomUUID } from 'node:crypto';
import type { UserRole } from '@fashion/contracts';
import { escapeRegex } from '../../common/escape-regex.js';
import { withCommerceTransaction } from '../../common/mongo-transaction.util.js';
import { assertSameRequest, requestHash, requireIdempotencyKey } from '../../common/idempotency.util.js';
import { AuditService } from '../operations/audit.service.js';
import { OutboxEvent } from '../operations/outbox-event.schema.js';
import { PaymentAttempt } from '../payments/payment.schemas.js';
import { Refund } from '../payments/payment.schemas.js';
import { reserveRefundBudget } from '../payments/refund-budget.util.js';
import { Address } from '../users/identity.schemas.js';
import { Product } from '../catalog/product.schema.js';
import { ProductVariant } from '../catalog/catalog.schemas.js';
import {
  CheckoutQuote,
  Order,
  OrderEvent,
  Shipment,
} from './commerce.schemas.js';
import { CartService } from './cart.service.js';
import { PricingService } from './pricing.service.js';
import { InventoryReservationService } from './inventory-reservation.service.js';
import {
  assertAdminTransition,
  customerMayCancel,
  shipmentAllowed,
  staffMayCancel,
  type OrderState,
} from './order-state.machine.js';
import {
  cartFingerprint,
  generateOrderCode,
  serializeOrder,
  type OrderLineSnapshot,
  type OrderMoney,
} from './order.types.js';
import { UsersService } from '../users/users.service.js';
import type { CancelOrderDto, CreateOrderDto, OrderStatusDto, ShipmentUpdateDto } from './commerce.dto.js';

const PAYMENT_HOLD_MS = 30 * 60 * 1000;
const SYSTEM_ACTOR_ID = '657000000000000000000001';

@Injectable()
export class OrderService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Order.name) private readonly orders: Model<Order>,
    @InjectModel(OrderEvent.name) private readonly orderEvents: Model<OrderEvent>,
    @InjectModel(CheckoutQuote.name) private readonly quotes: Model<CheckoutQuote>,
    @InjectModel(Shipment.name) private readonly shipments: Model<Shipment>,
    @InjectModel(PaymentAttempt.name) private readonly paymentAttempts: Model<PaymentAttempt>,
    @InjectModel(Refund.name) private readonly refunds: Model<Refund>,
    @InjectModel(Address.name) private readonly addresses: Model<Address>,
    @InjectModel(ProductVariant.name) private readonly variants: Model<ProductVariant>,
    @InjectModel(Product.name) private readonly products: Model<Product>,
    @InjectModel(OutboxEvent.name) private readonly outbox: Model<OutboxEvent>,
    private readonly carts: CartService,
    private readonly pricing: PricingService,
    private readonly reservations: InventoryReservationService,
    private readonly audit: AuditService,
    private readonly users: UsersService,
  ) {}

  async createOrder(customerId: string, idempotencyKey: string | undefined, dto: CreateOrderDto) {
    idempotencyKey = requireIdempotencyKey(idempotencyKey);
    const bodyHash = requestHash(dto);

    const existing = await this.orders.findOne({ customerId, idempotencyKey }).lean().exec();
    if (existing) { assertSameRequest(existing.requestHash, bodyHash); return serializeOrder(existing); }

    const quote = await this.quotes.findOne({ quoteId: dto.quoteId, customerId }).lean().exec();
    if (!quote) throw new NotFoundException('Checkout quote not found');
    if (quote.consumedAt) throw new ConflictException('Checkout quote was already used');
    if (quote.expiresAt.getTime() < Date.now()) throw new ConflictException('Checkout quote has expired');

    return withCommerceTransaction(this.connection, async (session) => {
      const replay = await this.orders.findOne({ customerId, idempotencyKey }).session(session).lean().exec();
      if (replay) { assertSameRequest(replay.requestHash, bodyHash); return serializeOrder(replay); }

      const cart = await this.carts.getCart(customerId, session);
      if (!cart.items.length) throw new BadRequestException('Cart is empty');
      const fingerprint = cartFingerprint(cart.items.map((item) => ({ variantId: item.variantId, quantity: item.quantity })));
      if (fingerprint !== quote.cartFingerprint) {
        throw new ConflictException('Cart changed since quote; request a new quote');
      }

      const address = await this.addresses
        .findOne({ _id: quote.addressId, customerId })
        .session(session)
        .lean()
        .exec();
      if (!address) throw new NotFoundException('Address not found');

      const settings = await this.pricing.getSettings(session);
      const { discount: voucherDiscount, code: voucherCode } = await this.pricing.resolveVoucher(
        quote.voucherCode,
        cart.subtotal,
        session,
      );
      const totals = this.pricing.totals(cart.subtotal, voucherDiscount, settings);
      if (
        totals.subtotal !== quote.subtotal
        || totals.shippingFee !== quote.shippingFee
        || totals.voucherDiscount !== quote.voucherDiscount
        || totals.payableTotal !== quote.payableTotal
      ) {
        throw new ConflictException('Pricing changed since quote; request a new quote');
      }

      const lines = await this.buildLineSnapshots(cart.items, session);
      const paymentDueAt = new Date(Date.now() + PAYMENT_HOLD_MS);
      const money: OrderMoney = { ...totals, voucherCode };

      const created = await this.orders.create(
        [{
          code: generateOrderCode(),
          customerId,
          items: lines,
          money: {
            subtotal: money.subtotal,
            shippingFee: money.shippingFee,
            voucherDiscount: money.voucherDiscount,
            payableTotal: money.payableTotal,
          },
          voucherCode,
          shippingSnapshot: {
            addressId: String(address._id),
            receiver: address.receiver,
            phone: address.phone,
            location: address.location,
            note: address.note ?? null,
            shippingMethod: 'STANDARD',
          },
          state: 'PENDING_PAYMENT',
          paymentDueAt,
          idempotencyKey,
          requestHash: bodyHash,
          version: 1,
        }],
        { session },
      );
      const order = created[0];

      const orderId = String(order._id);
      await this.reservations.reserveLines(lines, orderId, customerId, session);
      if (voucherCode) await this.reservations.consumeVoucherUsage(voucherCode, cart.subtotal, session);

      const consumed = await this.quotes.updateOne(
        { quoteId: dto.quoteId, customerId, consumedAt: null, expiresAt: { $gt: new Date() } },
        { $set: { consumedAt: new Date() } }, { session },
      ).exec();
      if (consumed.modifiedCount !== 1) throw new ConflictException('Checkout quote was already used or expired');
      await this.carts.clearCart(customerId, session);

      await this.orderEvents.create(
        [{ orderId, to: 'PENDING_PAYMENT', actorId: customerId, reason: 'Order created' }],
        { session },
      );

      await this.outbox.create(
        [{
          eventId: randomUUID(),
          type: 'order.created',
          occurredAt: new Date(),
          aggregateType: 'order',
          aggregateId: orderId,
          payload: {
            orderId,
            customerId,
            code: order.code,
            payableTotal: money.payableTotal,
            paymentDueAt: paymentDueAt.toISOString(),
          },
        }],
        { session },
      );

      await this.audit.record('order.create', 'order', orderId, customerId, { code: order.code }, session);
      return serializeOrder(order);
    });
  }

  async listOrders(customerId: string, page = 1, limit = 20) {
    const safeLimit = Math.min(50, Math.max(1, limit));
    const safePage = Math.max(1, page);
    const skip = (safePage - 1) * safeLimit;
    const [items, total] = await Promise.all([
      this.orders.find({ customerId }).sort({ createdAt: -1 }).skip(skip).limit(safeLimit).lean().exec(),
      this.orders.countDocuments({ customerId }).exec(),
    ]);
    return { page: safePage, limit: safeLimit, total, items: items.map(serializeOrder) };
  }

  async listAdminOrders(principal: { sub: string; role: UserRole }, state?: string, page = 1, limit = 20,
    search: { q?: string; customerId?: string } = {}) {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(50, Math.max(1, limit));
    const filter: Record<string, unknown> = state ? { state } : {};
    if (search.customerId) {
      if (!Types.ObjectId.isValid(search.customerId)) return { page: safePage, limit: safeLimit, total: 0, items: [] };
      filter.customerId = search.customerId;
    }
    const q = search.q?.trim();
    if (q) {
      const pattern = new RegExp(escapeRegex(q), 'i');
      filter.$or = [{ code: pattern }, { 'shippingSnapshot.receiver': pattern }, { 'shippingSnapshot.phone': pattern }];
    }
    if (principal.role === 'STAFF') {
      const scope = await this.users.permissionScope(principal.sub, 'order.read');
      if (!scope) throw new ForbiddenException('Insufficient permissions');
      if (scope === 'ASSIGNED') filter.assignedStaffId = principal.sub;
    }
    const [rows, total] = await Promise.all([
      this.orders.find(filter).sort({ createdAt: -1 }).skip((safePage - 1) * safeLimit).limit(safeLimit).lean().exec(),
      this.orders.countDocuments(filter).exec(),
    ]);
    return { page: safePage, limit: safeLimit, total, items: rows.map((row) => ({
      ...serializeOrder(row), customerId: String(row.customerId),
      assignedStaffId: row.assignedStaffId ? String(row.assignedStaffId) : null,
      itemCount: row.items?.length ?? 0,
      shippingSnapshot: {
        receiver: String(row.shippingSnapshot?.['receiver'] ?? ''),
        phone: String(row.shippingSnapshot?.['phone'] ?? ''),
      },
    })) };
  }

  async assignStaff(orderId: string, staffId: string, actorId: string) {
    if (!Types.ObjectId.isValid(orderId) || !Types.ObjectId.isValid(staffId)) throw new NotFoundException('Order or staff not found');
    return withCommerceTransaction(this.connection, async (session) => {
      const staff = await this.users.model.findById(staffId).session(session).exec();
      if (!staff || staff.role !== 'STAFF' || staff.status !== 'ACTIVE') throw new NotFoundException('Staff not found');
      const order = await this.orders.findByIdAndUpdate(orderId,
        { $set: { assignedStaffId: staffId } }, { new: true, session }).exec();
      if (!order) throw new NotFoundException('Order not found');
      await this.audit.record('order.assign_staff', 'order', orderId, actorId, { staffId }, session);
      return { orderId, staffId };
    });
  }

  async getOrder(orderId: string, principal: { sub: string; role: UserRole }) {
    if (!Types.ObjectId.isValid(orderId)) throw new NotFoundException('Order not found');
    const order = await this.orders.findById(orderId).lean().exec();
    if (!order) throw new NotFoundException('Order not found');
    if (principal.role === 'CUSTOMER' && String(order.customerId) !== principal.sub) {
      throw new NotFoundException('Order not found');
    }
    if (principal.role === 'STAFF') {
      const allowed = await this.users.hasPermissions(principal.sub, ['order.read'], orderId);
      if (!allowed) throw new ForbiddenException('Insufficient permissions');
    }
    const events = await this.orderEvents.find({ orderId }).sort({ createdAt: 1 }).lean().exec();
    const shipment = await this.shipments.findOne({ orderId }).lean().exec();
    return {
      ...serializeOrder(order),
      items: order.items,
      shippingSnapshot: order.shippingSnapshot,
      statusHistory: events.map((event) => ({
        from: event.from,
        to: event.to,
        actorId: String(event.actorId),
        reason: event.reason,
        createdAt: (event as { createdAt?: Date }).createdAt?.toISOString(),
      })),
      shipment: shipment
        ? {
            carrier: shipment.carrier,
            trackingCode: shipment.trackingCode,
            status: shipment.status,
            events: shipment.events,
          }
        : null,
    };
  }

  async cancelOrder(
    orderId: string,
    principal: { sub: string; role: UserRole },
    idempotencyKey: string | undefined,
    dto: CancelOrderDto,
    staffMayCancelOrder: boolean,
  ) {
    idempotencyKey = requireIdempotencyKey(idempotencyKey);
    const bodyHash = requestHash(dto);
    if (!Types.ObjectId.isValid(orderId)) throw new NotFoundException('Order not found');

    return withCommerceTransaction(this.connection, async (session) => {
      const order = await this.orders.findById(orderId).session(session).exec();
      if (!order) throw new NotFoundException('Order not found');

      if (principal.role === 'CUSTOMER') {
        if (String(order.customerId) !== principal.sub) throw new NotFoundException('Order not found');
      } else if (principal.role === 'STAFF') {
        if (!staffMayCancelOrder) throw new ForbiddenException('Insufficient permissions');
      } else if (principal.role !== 'ADMIN') {
        throw new ForbiddenException('Insufficient permissions');
      }

      if (order.state === 'CANCELLED' || order.state === 'CANCEL_PENDING_REFUND') {
        if (order.cancelIdempotencyKey === idempotencyKey) assertSameRequest(order.cancelRequestHash, bodyHash);
        return serializeOrder(order);
      }

      if (principal.role === 'CUSTOMER') {
        if (!customerMayCancel(order.state as OrderState)) {
          throw new ForbiddenException('Order cannot be cancelled in its current state');
        }
      } else if (!staffMayCancel(order.state as OrderState)) {
        throw new UnprocessableEntityException('Order cannot be cancelled in its current state');
      }

      const payment = await this.paymentAttempts.findOne({ orderId, state: 'SUCCEEDED' }).session(session).lean().exec();
      const paid = payment?.state === 'SUCCEEDED';
      let nextState: OrderState = paid ? 'CANCEL_PENDING_REFUND' : 'CANCELLED';
      let remainingRefundAmount = payment?.expectedAmount ?? 0;
      if (paid && payment) {
        const existingRefunds = await this.refunds.find({ paymentAttemptId: String(payment._id),
          state: { $in: ['PENDING_APPROVAL', 'APPROVED', 'SUCCEEDED'] } }).session(session).lean().exec();
        remainingRefundAmount = payment.expectedAmount - existingRefunds.reduce((sum, row) => sum + row.amount, 0);
        if (remainingRefundAmount < 0) throw new ConflictException('Refund budget requires reconciliation');
        const refunded = existingRefunds.filter((row) => row.state === 'SUCCEEDED')
          .reduce((sum, row) => sum + row.amount, 0);
        if (refunded >= payment.expectedAmount) nextState = 'CANCELLED';
      }
      const fromState = order.state as OrderState;

      order.state = nextState;
      order.cancelIdempotencyKey = idempotencyKey;
      order.cancelRequestHash = bodyHash;
      order.version += 1;
      await order.save({ session });

      const lines = order.items as OrderLineSnapshot[];
      await this.reservations.releaseLines(orderId, lines, principal.sub, dto.reason, session);
      await this.reservations.releaseVoucherUsage(orderId, order.voucherCode, principal.sub, session);

      if (paid && payment && remainingRefundAmount > 0) {
        const refundAmount = await reserveRefundBudget(
          this.paymentAttempts, this.refunds, String(payment._id), payment.expectedAmount, 'REMAINING', session,
        );
        await this.refunds.create(
          [{
            paymentAttemptId: String(payment._id),
            orderId,
            amount: refundAmount,
            state: 'PENDING_APPROVAL',
            idempotencyKey: `cancel:${orderId}:${idempotencyKey}`,
            reason: dto.reason,
            proposedBy: principal.sub,
          }],
          { session },
        );
      }
      // order_pending_unique permits one current pending attempt, independently of history.
      const pendingPayment = await this.paymentAttempts.findOne({ orderId, state: 'PENDING' })
        .session(session).lean().exec();
      if (pendingPayment) {
        await this.paymentAttempts.updateOne(
          { _id: pendingPayment._id, state: 'PENDING' }, { $set: { state: 'FAILED' } }, { session },
        ).exec();
      }

      await this.orderEvents.create(
        [{ orderId, from: fromState, to: nextState, actorId: principal.sub, reason: dto.reason }],
        { session },
      );

      await this.outbox.create(
        [{
          eventId: randomUUID(),
          type: 'order.status_changed',
          occurredAt: new Date(),
          aggregateType: 'order',
          aggregateId: orderId,
          payload: {
            orderId,
            customerId: String(order.customerId),
            from: fromState,
            to: nextState,
            code: order.code,
          },
        }],
        { session },
      );

      await this.audit.record('order.cancel', 'order', orderId, principal.sub, { to: nextState }, session);
      return serializeOrder(order);
    });
  }

  async updateStatus(orderId: string, actorId: string, dto: OrderStatusDto) {
    if (!Types.ObjectId.isValid(orderId)) throw new NotFoundException('Order not found');

    return withCommerceTransaction(this.connection, async (session) => {
      const order = await this.orders.findOne({ _id: orderId }).session(session).exec();
      if (!order) throw new NotFoundException('Order not found');

      if (dto.expectedVersion != null && order.version !== dto.expectedVersion) {
        throw new ConflictException('Order version conflict');
      }

      const payment = await this.paymentAttempts.findOne({ orderId, state: 'SUCCEEDED' }).session(session).lean().exec();
      const paymentSucceeded = payment?.state === 'SUCCEEDED';
      const fromState = order.state as OrderState;
      const toState = dto.state;

      try {
        assertAdminTransition(fromState, toState, paymentSucceeded);
      } catch (error) {
        throw new UnprocessableEntityException(error instanceof Error ? error.message : 'Invalid transition');
      }

      order.state = toState;
      order.version += 1;
      await order.save({ session });
      if (toState === 'DELIVERED') {
        await this.reservations.commitLines(orderId, order.items as OrderLineSnapshot[], actorId, session);
      }

      await this.orderEvents.create(
        [{ orderId, from: fromState, to: toState, actorId, reason: dto.reason }],
        { session },
      );

      await this.outbox.create(
        [{
          eventId: randomUUID(),
          type: 'order.status_changed',
          occurredAt: new Date(),
          aggregateType: 'order',
          aggregateId: orderId,
          payload: {
            orderId,
            customerId: String(order.customerId),
            from: fromState,
            to: toState,
            code: order.code,
          },
        }],
        { session },
      );

      await this.audit.record('order.status.update', 'order', orderId, actorId, { from: fromState, to: toState }, session);
      return serializeOrder(order);
    });
  }

  async updateShipment(orderId: string, actorId: string, dto: ShipmentUpdateDto) {
    if (!Types.ObjectId.isValid(orderId)) throw new NotFoundException('Order not found');

    return withCommerceTransaction(this.connection, async (session) => {
      const order = await this.orders.findById(orderId).session(session).exec();
      if (!order) throw new NotFoundException('Order not found');

      const previous = await this.shipments.findOne({ orderId }).session(session).lean().exec();
      if (previous?.status === dto.status && previous.carrier === dto.carrier && previous.trackingCode === dto.trackingCode
        && (previous.events.at(-1)?.note ?? null) === (dto.note ?? null)) {
        return { orderId, carrier: previous.carrier, trackingCode: previous.trackingCode, status: previous.status, events: previous.events };
      }
      if (!shipmentAllowed(order.state as OrderState)) {
        throw new UnprocessableEntityException('Shipment cannot be updated for this order');
      }
      const transitions: Record<string, string[]> = {
        READY: ['PICKED_UP', 'IN_TRANSIT', 'FAILED'], PICKED_UP: ['IN_TRANSIT', 'DELIVERED', 'FAILED'],
        IN_TRANSIT: ['DELIVERED', 'FAILED'], DELIVERED: [], FAILED: [],
      };
      if (previous && previous.status !== dto.status && !transitions[previous.status]?.includes(dto.status)) {
        throw new UnprocessableEntityException('Shipment status cannot move backwards or leave a terminal state');
      }
      if ((dto.status === 'READY' && order.state === 'SHIPPING')
        || (['PICKED_UP', 'IN_TRANSIT', 'FAILED'].includes(dto.status) && order.state === 'CONFIRMED')
        || (dto.status === 'DELIVERED' && order.state !== 'SHIPPING')) {
        throw new UnprocessableEntityException('Shipment status does not match the order fulfillment stage');
      }

      const event = { status: dto.status, note: dto.note ?? null, at: new Date().toISOString(), actorId };
      await this.shipments.findOneAndUpdate(
        { orderId },
        {
          $set: { carrier: dto.carrier, trackingCode: dto.trackingCode, status: dto.status },
          $push: { events: event },
        },
        { upsert: true, new: true, session },
      ).exec();

      const payment = await this.paymentAttempts.findOne({ orderId, state: 'SUCCEEDED' }).session(session).lean().exec();
      const paymentSucceeded = payment?.state === 'SUCCEEDED';
      let state = order.state as OrderState;

      const advance = async (to: OrderState, reason: string) => {
        assertAdminTransition(state, to, paymentSucceeded);
        const from = state;
        await this.orderEvents.create([{ orderId, from, to, actorId, reason }], { session });
        state = to;
        order.state = to;
        order.version += 1;
        await order.save({ session });
        await this.outbox.create(
          [{
            eventId: randomUUID(),
            type: 'order.status_changed',
            occurredAt: new Date(),
            aggregateType: 'order',
            aggregateId: orderId,
            payload: {
              orderId,
              customerId: String(order.customerId),
              from,
              to,
              code: order.code,
            },
          }],
          { session },
        );
      };

      if (dto.status === 'READY' && state === 'CONFIRMED') await advance('PREPARING', 'Shipment ready');
      if (['PICKED_UP', 'IN_TRANSIT'].includes(dto.status) && state === 'PREPARING') await advance('SHIPPING', dto.note ?? 'Shipment in transit');
      if (dto.status === 'DELIVERED' && state === 'SHIPPING') {
        await advance('DELIVERED', dto.note ?? 'Delivered');
        await this.reservations.commitLines(orderId, order.items as OrderLineSnapshot[], actorId, session);
      }

      await this.audit.record('order.shipment.update', 'order', orderId, actorId, { status: dto.status }, session);
      const shipment = await this.shipments.findOne({ orderId }).session(session).lean().exec();
      return {
        orderId,
        carrier: shipment?.carrier,
        trackingCode: shipment?.trackingCode,
        status: shipment?.status,
        events: shipment?.events ?? [],
      };
    });
  }

  async confirmFromPayment(orderId: string, session: import('mongoose').ClientSession, paidAt = new Date()): Promise<boolean> {
    const order = await this.orders
      .findOneAndUpdate(
        { _id: orderId, state: 'PENDING_PAYMENT', paymentDueAt: { $gte: paidAt } },
        { $set: { state: 'CONFIRMED' }, $inc: { version: 1 } },
        { new: true, session },
      )
      .exec();
    if (!order) return false;

    await this.orderEvents.create(
      [{ orderId, from: 'PENDING_PAYMENT', to: 'CONFIRMED', actorId: SYSTEM_ACTOR_ID, reason: 'Payment succeeded' }],
      { session },
    );

    await this.outbox.create(
      [{
        eventId: randomUUID(),
        type: 'order.status_changed',
        occurredAt: new Date(),
        aggregateType: 'order',
        aggregateId: orderId,
        payload: {
          orderId,
          customerId: String(order.customerId),
          from: 'PENDING_PAYMENT',
          to: 'CONFIRMED',
          code: order.code,
        },
      }],
      { session },
    );

    await this.audit.record('order.confirm.payment', 'order', orderId, SYSTEM_ACTOR_ID, {}, session);
    return true;
  }

  async expireDueOrders(limit = 50): Promise<number> {
    const due = await this.orders
      .find({ state: 'PENDING_PAYMENT', paymentDueAt: { $lt: new Date() } })
      .sort({ paymentDueAt: 1 })
      .limit(limit)
      .lean()
      .exec();

    let processed = 0;
    for (const row of due) {
      try {
        await this.expireOrder(String(row._id));
        processed += 1;
      } catch {
        // concurrent cancel/expiry — skip
      }
    }
    return processed;
  }

  async expireOrder(orderId: string): Promise<void> {
    await withCommerceTransaction(this.connection, async (session) => {
      const order = await this.orders
        .findOneAndUpdate(
          { _id: orderId, state: 'PENDING_PAYMENT' },
          { $set: { state: 'CANCELLED' }, $inc: { version: 1 } },
          { new: true, session },
        )
        .exec();
      if (!order) return;

      const lines = order.items as OrderLineSnapshot[];
      await this.reservations.releaseLines(orderId, lines, SYSTEM_ACTOR_ID, 'PAYMENT_EXPIRED', session);
      await this.reservations.releaseVoucherUsage(orderId, order.voucherCode, SYSTEM_ACTOR_ID, session);

      await this.paymentAttempts
        .updateMany({ orderId, state: 'PENDING' }, { $set: { state: 'FAILED' } }, { session })
        .exec();

      await this.orderEvents.create(
        [{ orderId, from: 'PENDING_PAYMENT', to: 'CANCELLED', actorId: SYSTEM_ACTOR_ID, reason: 'PAYMENT_EXPIRED' }],
        { session },
      );

      await this.outbox.create(
        [{
          eventId: randomUUID(),
          type: 'order.status_changed',
          occurredAt: new Date(),
          aggregateType: 'order',
          aggregateId: orderId,
          payload: {
            orderId,
            customerId: String(order.customerId),
            from: 'PENDING_PAYMENT',
            to: 'CANCELLED',
            code: order.code,
            reason: 'PAYMENT_EXPIRED',
          },
        }],
        { session },
      );
    });
  }

  private async buildLineSnapshots(
    items: Array<{ variantId: string; quantity: number; unitPrice?: number; sku?: string; productName?: string }>,
    session: import('mongoose').ClientSession,
  ): Promise<OrderLineSnapshot[]> {
    const variants = await this.variants.find({ _id: { $in: items.map((item) => item.variantId) }, status: 'ACTIVE' }).session(session).lean().exec();
    const products = await this.products.find({ _id: { $in: variants.map((v) => v.productId) }, status: 'PUBLISHED' }).session(session).lean().exec();
    const variantMap = new Map(variants.map((variant) => [String(variant._id), variant]));
    const productMap = new Map(products.map((product) => [String(product._id), product]));

    return items.map((item) => {
      const variant = variantMap.get(item.variantId);
      if (!variant) throw new ConflictException('Variant is unavailable');
      const product = productMap.get(String(variant.productId));
      if (!product) throw new ConflictException('Product is no longer published');
      const unitPrice = item.unitPrice ?? variant.price;
      const lineTotal = unitPrice * item.quantity;
      return {
        lineId: new Types.ObjectId().toString(),
        productId: String(variant.productId),
        variantId: item.variantId,
        sku: item.sku ?? variant.sku,
        productName: item.productName ?? product?.name ?? 'Product',
        unitPrice,
        quantity: item.quantity,
        discount: 0,
        lineTotal,
      };
    });
  }
}
