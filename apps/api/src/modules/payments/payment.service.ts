import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Model, Types, type ClientSession, type Connection } from 'mongoose';
import { buildVietQrImageUrl } from '@gpmpay/sdk';
import type { UserRole } from '@fashion/contracts';
import { Order } from '../commerce/commerce.schemas.js';
import { assertPositivePayableTotal } from '../commerce/pricing.service.js';
import { PaymentAttempt, PaymentEvent } from './payment.schemas.js';
import { readGpmpayConfig } from './gpmpay.config.js';
import { readSepayConfig } from './sepay.config.js';
import { readPaymentProvider, type PaymentProvider } from './payment-provider.config.js';
import { generateReconciliationCode } from './reconciliation.util.js';
import { serializePaymentAttempt } from './payment.mapper.js';
import type { CreatePaymentAttemptDto } from './payments.dto.js';
import { UsersService } from '../users/users.service.js';
import { requireIdempotencyKey } from '../../common/idempotency.util.js';
import { withCommerceTransaction } from '../../common/mongo-transaction.util.js';

@Injectable()
export class PaymentService {
  constructor(
    @InjectModel(PaymentAttempt.name) private readonly attempts: Model<PaymentAttempt>,
    @InjectModel(Order.name) private readonly orders: Model<Order>,
    private readonly users: UsersService,
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(PaymentEvent.name) private readonly events?: Model<PaymentEvent>,
  ) {}

  async createAttempt(customerId: string, key: string | undefined, dto: CreatePaymentAttemptDto) {
    requireIdempotencyKey(key);
    if (!Types.ObjectId.isValid(dto.orderId)) throw new NotFoundException('Order not found');
    const existingReview = (await this.reviewMetadata([dto.orderId])).get(dto.orderId);
    if (existingReview?.hasOpenReview) return this.latestForOrder(dto.orderId, { sub: customerId, role: 'CUSTOMER' });
    const result = await this.createAttemptRecord(customerId, key, dto);
    const metadata = (await this.reviewMetadata([result.orderId])).get(result.orderId) ?? { hasOpenReview: false, reviewOutcome: null };
    return { ...result, ...metadata, ...(metadata.hasOpenReview ? { qrImageUrl: undefined } : {}) };
  }

  private async reviewMetadata(orderIds: string[]) {
    const result = new Map<string, { hasOpenReview: boolean; reviewOutcome: 'REFUNDED_EXTERNALLY' | null }>();
    if (!this.events || !orderIds.length) return result;
    const open = ['REQUIRES_REVIEW', 'UNMATCHED', 'ESCALATED', 'PENDING_APPROVAL'];
    const rows = await this.attempts.aggregate<{ _id: unknown; open: number; returned: number }>([
      { $match: { orderId: { $in: orderIds.map(id => new Types.ObjectId(id)) } } },
      { $lookup: { from: 'payment_events', let: { attemptId: '$_id' }, pipeline: [
        { $match: { $expr: { $eq: ['$matchedAttemptId', '$$attemptId'] }, resolution: { $in: [...open, 'REFUNDED_EXTERNALLY'] } } },
        { $group: { _id: null, open: { $max: { $cond: [{ $in: ['$resolution', open] }, 1, 0] } }, returned: { $max: { $cond: [{ $eq: ['$resolution', 'REFUNDED_EXTERNALLY'] }, 1, 0] } } } },
      ], as: 'review' } },
      { $unwind: '$review' },
      { $group: { _id: '$orderId', open: { $max: '$review.open' }, returned: { $max: '$review.returned' } } },
    ]).exec();
    for (const row of rows) result.set(String(row._id), { hasOpenReview: row.open === 1, reviewOutcome: row.returned ? 'REFUNDED_EXTERNALLY' : null });
    return result;
  }

  async latestForOrder(orderId: string, principal: { sub: string; role: UserRole }) {
    if (!Types.ObjectId.isValid(orderId)) throw new NotFoundException('Payment not found');
    const latest = await this.attempts.findOne({ orderId }).sort({ createdAt: -1, _id: -1 }).select('_id').lean().exec();
    if (!latest) throw new NotFoundException('Payment not found');
    return this.getPayment(String(latest._id), principal);
  }

  private async createAttemptRecord(customerId: string, key: string | undefined, dto: CreatePaymentAttemptDto) {
    const idempotencyKey = requireIdempotencyKey(key);
    const provider = readPaymentProvider();
    if (!Types.ObjectId.isValid(dto.orderId)) throw new NotFoundException('Order not found');
    for (let retry = 0; retry < 3; retry += 1) {
      try {
        return await withCommerceTransaction(this.connection, async (session) => {
          const order = await this.orders.findById(dto.orderId).session(session).lean().exec();
          if (!order || String(order.customerId) !== customerId) throw new NotFoundException('Order not found');
          const replay = await this.attempts.findOne({ idempotencyKey }).session(session).lean().exec();
          if (replay && String(replay.orderId) !== dto.orderId) {
            throw new ConflictException({ code: 'IDEMPOTENCY_CONFLICT', message: 'Key belongs to another payment request' });
          }
          if (replay && replay.state !== 'PENDING') {
            return serializePaymentAttempt(replay as never,
              replay.provider === provider ? this.providerConfig(provider) : undefined);
          }

          assertPositivePayableTotal(order.money?.payableTotal);

          // This write conflicts with cancellation's write to the same order document.
          const now = new Date();
          const payable = await this.orders.findOneAndUpdate({ _id: dto.orderId, customerId,
            state: 'PENDING_PAYMENT', paymentDueAt: { $gt: now } },
          { $inc: { paymentAttemptRevision: 1 } }, { new: true, session, timestamps: false }).lean().exec();
          if (!payable) throw new ConflictException(order.state === 'PENDING_PAYMENT'
            ? 'Order payment window has expired' : 'Order is not awaiting payment');
          if (replay) {
            if (replay.provider !== provider) throw new ConflictException('Order has a pending attempt with the inactive provider');
            if (!this.isPayable(payable, replay.expiresAt)) {
              throw new ConflictException('Order payment window has expired');
            }
            const config = this.providerConfig(provider);
            return this.withQr(serializePaymentAttempt(replay as never, config), config,
              replay.reconciliationCode, replay.expectedAmount);
          }

          const succeeded = await this.attempts.findOne({ orderId: dto.orderId, state: 'SUCCEEDED' })
            .session(session).lean().exec();
          if (succeeded) throw new ConflictException('Order is already paid');
          const pending = await this.attempts.findOne({ orderId: dto.orderId, state: 'PENDING' })
            .session(session).lean().exec();
          const config = this.providerConfig(provider);
          if (pending && pending.expiresAt > now) {
            if (pending.provider !== provider) throw new ConflictException('Order already has a pending attempt with another provider');
            if (!this.isPayable(payable, pending.expiresAt)) {
              throw new ConflictException('Order payment window has expired');
            }
            return this.withQr(serializePaymentAttempt(pending as never, config), config,
              pending.reconciliationCode, pending.expectedAmount);
          }
          if (pending) {
            await this.attempts.updateOne({ _id: pending._id, state: 'PENDING', expiresAt: { $lte: now } },
              { $set: { state: 'FAILED' } }, { session }).exec();
          }

          const reconciliationCode = await this.uniqueReconciliationCode(session);
          const [created] = await this.attempts.create([{
            orderId: dto.orderId,
            provider,
            reconciliationCode,
            expectedAmount: payable.money.payableTotal,
            currency: 'VND',
            state: 'PENDING',
            idempotencyKey,
            expiresAt: payable.paymentDueAt,
          }], { session });
          if (!this.isPayable(payable, created.expiresAt)) {
            throw new ConflictException('Order payment window has expired');
          }
          return this.withQr(serializePaymentAttempt(created, config), config,
            reconciliationCode, payable.money.payableTotal);
        });
      } catch (error) {
        if (typeof error === 'object' && error && 'code' in error && error.code === 11000) {
          if (retry < 2) continue;
          throw new ConflictException('Payment attempt could not be created');
        }
        throw error;
      }
    }
    throw new ConflictException('Payment attempt could not be created');
  }

  async listPayments(
    principal: { sub: string; role: UserRole },
    page = 1,
    limit = 20,
  ) {
    const safeLimit = Math.min(50, Math.max(1, limit));
    const safePage = Math.max(1, page);
    const skip = (safePage - 1) * safeLimit;

    let assignedStaffId: string | undefined;
    if (principal.role === 'STAFF') {
      const scope = await this.users.permissionScope(principal.sub, 'payment.read');
      if (!scope) throw new ForbiddenException('Insufficient permissions');
      if (scope === 'ASSIGNED') assignedStaffId = principal.sub;
    }

    const orderFilter = principal.role === 'CUSTOMER' ? { customerId: principal.sub }
      : assignedStaffId ? { assignedStaffId } : null;

    let rows: Array<PaymentAttempt & { _id: unknown }>;
    let total: number;
    if (orderFilter) {
      const scope = Object.fromEntries(Object.entries(orderFilter).map(([key, value]) => [key, new Types.ObjectId(value)]));
      // The join and count stay in MongoDB; no unbounded list of order IDs enters Node.
      const [result] = await this.orders.aggregate<{ items: typeof rows; count: Array<{ total: number }> }>([
        { $match: scope },
        { $lookup: { from: 'payment_attempts', localField: '_id', foreignField: 'orderId', as: 'attempt' } },
        { $unwind: '$attempt' }, { $replaceRoot: { newRoot: '$attempt' } },
        { $facet: { items: [{ $sort: { createdAt: -1, _id: -1 } }, { $skip: skip }, { $limit: safeLimit }], count: [{ $count: 'total' }] } },
      ]).exec();
      rows = result?.items ?? []; total = result?.count[0]?.total ?? 0;
    } else {
      [rows, total] = await Promise.all([
        this.attempts.find({}).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(safeLimit).lean().exec(),
        this.attempts.countDocuments({}).exec(),
      ]);
    }
    const reviews = await this.reviewMetadata([...new Set(rows.map(row => String(row.orderId)))]);
    const activeProvider = readPaymentProvider();

    return {
      page: safePage,
      limit: safeLimit,
      total,
      items: rows.map(row => ({ ...serializePaymentAttempt(row as never,
        row.provider === activeProvider ? this.providerConfig(activeProvider) : undefined), ...(reviews.get(String(row.orderId)) ?? { hasOpenReview: false, reviewOutcome: null }) })),
    };
  }

  async getPayment(paymentId: string, principal: { sub: string; role: UserRole }) {
    if (!Types.ObjectId.isValid(paymentId)) throw new NotFoundException('Payment not found');
    const attempt = await this.attempts.findById(paymentId).lean().exec();
    if (!attempt) throw new NotFoundException('Payment not found');

    const order = await this.orders.findById(attempt.orderId).lean().exec();
    if (!order) throw new NotFoundException('Payment not found');

    if (principal.role === 'CUSTOMER' && String(order.customerId) !== principal.sub) {
      throw new NotFoundException('Payment not found');
    }
    if (principal.role === 'STAFF') {
      const allowed = await this.users.hasPermissions(principal.sub, ['payment.read'], String(order._id));
      if (!allowed) throw new ForbiddenException('Insufficient permissions');
    }

    const activeProvider = readPaymentProvider();
    const config = attempt.provider === activeProvider ? this.providerConfig(activeProvider) : undefined;
    const metadata = (await this.reviewMetadata([String(attempt.orderId)])).get(String(attempt.orderId)) ?? { hasOpenReview: false, reviewOutcome: null };
    const serialized = { ...serializePaymentAttempt(attempt as never, config), ...metadata,
      canRetry: !metadata.hasOpenReview && order.money.payableTotal > 0 && order.state === 'PENDING_PAYMENT' && Boolean(order.paymentDueAt && order.paymentDueAt.getTime() > Date.now())
        && (attempt.state === 'FAILED' || attempt.expiresAt.getTime() <= Date.now() || attempt.provider !== activeProvider) };
    if (config && !serialized.hasOpenReview && attempt.state === 'PENDING' && this.isPayable(order, attempt.expiresAt)) {
      return this.withQr(serialized, config, attempt.reconciliationCode, attempt.expectedAmount);
    }
    return serialized;
  }

  private isPayable(order: Order, expiresAt: Date): boolean {
    const now = Date.now();
    return order.money.payableTotal > 0 && order.state === 'PENDING_PAYMENT' && Boolean(order.paymentDueAt)
      && order.paymentDueAt!.getTime() > now && expiresAt.getTime() > now;
  }

  private withQr<T extends Record<string, unknown>>(
    payload: T,
    config: ReturnType<typeof readGpmpayConfig> | ReturnType<typeof readSepayConfig>,
    reconciliationCode: string,
    amount: number,
  ) {
    try {
      const qrImageUrl = payload.provider === 'SEPAY' ? this.sepayQrUrl(config, reconciliationCode, amount) : buildVietQrImageUrl({
        bankBin: config.bankBin,
        accountNumber: config.accountNumber,
        accountName: config.accountName,
        amount,
        description: reconciliationCode,
        template: 'compact',
      });
      return { ...payload, qrImageUrl };
    } catch {
      throw new ServiceUnavailableException('Unable to build VietQR for payment');
    }
  }

  private providerConfig(provider: PaymentProvider) {
    return provider === 'SEPAY' ? readSepayConfig() : readGpmpayConfig();
  }

  private sepayQrUrl(config: { bankBin: string; accountNumber: string; accountName: string }, code: string, amount: number): string {
    const url = new URL('https://vietqr.app/img');
    url.searchParams.set('acc', config.accountNumber);
    url.searchParams.set('bank', config.bankBin);
    url.searchParams.set('amount', String(amount));
    url.searchParams.set('des', code);
    url.searchParams.set('template', 'compact');
    url.searchParams.set('holder', config.accountName);
    return url.toString();
  }

  private async uniqueReconciliationCode(session: ClientSession): Promise<string> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const code = generateReconciliationCode();
      const exists = await this.attempts.exists({ reconciliationCode: code }).session(session).exec();
      if (!exists) return code;
    }
    throw new ServiceUnavailableException('Unable to allocate reconciliation code');
  }
}
