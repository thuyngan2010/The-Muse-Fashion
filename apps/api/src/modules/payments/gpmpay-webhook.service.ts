import {
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { createHash } from 'node:crypto';
import { Model, type Connection } from 'mongoose';
import { randomUUID } from 'node:crypto';
import {
  constructWebhookEvent,
  GpmPayWebhookSignatureError,
  type WebhookPayload,
} from '@gpmpay/sdk';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { withCommerceTransaction } from '../../common/mongo-transaction.util.js';
import { AuditService } from '../operations/audit.service.js';
import { OutboxEvent } from '../operations/outbox-event.schema.js';
import { OrderService } from '../commerce/order.service.js';
import { Order } from '../commerce/commerce.schemas.js';
import { PaymentAttempt, PaymentEvent } from './payment.schemas.js';
import { RefundService } from './refund.service.js';
import { readBeneficiary } from './beneficiary-crypto.util.js';
import { readGpmpayConfig } from './gpmpay.config.js';
import { assertActivePaymentProvider, type PaymentProvider } from './payment-provider.config.js';
import { extractReconciliationCodes, extractRefundReconciliationCodes } from './reconciliation.util.js';

type ExtendedWebhookPayload = WebhookPayload & {
  counterAccount?: string | null;
  counterBankBin?: string | null;
};

@Injectable()
export class GpmpayWebhookService {
  private readonly logger = new Logger(GpmpayWebhookService.name);

  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(PaymentAttempt.name) private readonly attempts: Model<PaymentAttempt>,
    @InjectModel(PaymentEvent.name) private readonly events: Model<PaymentEvent>,
    @InjectModel(OutboxEvent.name) private readonly outbox: Model<OutboxEvent>,
    @InjectModel(Order.name) private readonly orderDocs: Model<Order>,
    private readonly orders: OrderService,
    private readonly refunds: RefundService,
    private readonly audit: AuditService,
  ) {}

  async handle(req: RawBodyRequest<Request>, signatureHeader: string | undefined): Promise<void> {
    assertActivePaymentProvider('GPMPAY');
    const config = readGpmpayConfig();
    const rawBody = this.rawBody(req);
    const signature = signatureHeader ?? '';

    let event;
    try {
      event = constructWebhookEvent({
        rawBody,
        signature,
        secret: config.webhookSecret,
        headers: req.headers as Record<string, string | string[] | undefined>,
      });
    } catch (error) {
      if (error instanceof GpmPayWebhookSignatureError) {
        await this.audit.record('payment.webhook.invalid_signature', 'payment_event', 'gpmpay', undefined, {
          reason: error.reason,
        });
        throw new UnauthorizedException({ code: 'WEBHOOK_SIGNATURE_INVALID', message: 'Webhook signature verification failed' });
      }
      throw error;
    }

    const envelope = JSON.parse(event.rawBody) as { test?: boolean };
    if (envelope.test === true) return;

    await this.handleVerified(event.payload as ExtendedWebhookPayload, event.rawBody, 'GPMPAY', config);
  }

  async handleVerified(payload: ExtendedWebhookPayload, rawBody: string, provider: PaymentProvider,
    config: { accountNumber: string; allowSimulated: boolean }): Promise<void> {
    const existing = await this.events.findOne({ provider, eventId: payload.id }).lean().exec();
    if (existing) return;

    if (payload.transferType === 'out') {
      if (provider === 'SEPAY') {
        // SePay's documented webhook does not identify the beneficiary; require manual review.
        await this.storeEvent(payload, rawBody, 'REQUIRES_REVIEW', true, undefined, provider);
      } else {
        await this.handleOutbound(payload, rawBody, config, provider);
      }
      return;
    }
    if (payload.transferType !== 'in') {
      await this.storeEvent(payload, rawBody, 'UNMATCHED', true, undefined, provider);
      return;
    }

    if (!config.allowSimulated && payload.source === 'SIMULATED') {
      await this.storeEvent(payload, rawBody, 'IGNORED', true, undefined, provider);
      return;
    }

    if (payload.accountNumber !== config.accountNumber) {
      await this.storeEvent(payload, rawBody, 'UNMATCHED', true, undefined, provider);
      return;
    }

    const codes = extractReconciliationCodes(payload.content ?? '');
    if (codes.length !== 1) {
      await this.storeEvent(payload, rawBody, codes.length === 0 ? 'UNMATCHED' : 'REQUIRES_REVIEW', true, undefined, provider);
      return;
    }

    const attempt = await this.attempts.findOne({ provider, reconciliationCode: codes[0] }).exec();
    if (!attempt) {
      await this.storeEvent(payload, rawBody, 'UNMATCHED', true, undefined, provider);
      return;
    }

    if (attempt.state === 'SUCCEEDED') {
      await this.storeEvent(payload, rawBody, 'REQUIRES_REVIEW', true, String(attempt._id), provider);
      return;
    }

    if (payload.transferAmount !== attempt.expectedAmount) {
      await this.storeEvent(payload, rawBody, 'REQUIRES_REVIEW', true, String(attempt._id), provider);
      return;
    }

    if (attempt.state !== 'PENDING' || attempt.expiresAt.getTime() < Date.now()) {
      await this.storeEvent(payload, rawBody, 'REQUIRES_REVIEW', true, String(attempt._id), provider);
      return;
    }

    try {
      await withCommerceTransaction(this.connection, async (session) => {
        const dedup = await this.events.findOne({ provider, eventId: payload.id }).session(session).lean().exec();
        if (dedup) return;

        const currentAttempt = await this.attempts
          .findOne({ _id: attempt._id, state: 'PENDING' })
          .session(session)
          .exec();
        if (!currentAttempt) {
          await this.events.create([this.eventDoc(payload, rawBody, 'REQUIRES_REVIEW', true, String(attempt._id), provider)], { session });
          return;
        }

        if (payload.transferAmount !== currentAttempt.expectedAmount) {
          await this.events.create([this.eventDoc(payload, rawBody, 'REQUIRES_REVIEW', true, String(attempt._id), provider)], { session });
          return;
        }

        const now = new Date();
        if (currentAttempt.expiresAt.getTime() < now.getTime()) {
          await this.events.create([this.eventDoc(payload, rawBody, 'REQUIRES_REVIEW', true, String(currentAttempt._id), provider)], { session });
          return;
        }

        const confirmed = await this.orders.confirmFromPayment(String(currentAttempt.orderId), session, now);
        if (!confirmed) {
          await this.events.create([this.eventDoc(payload, rawBody, 'REQUIRES_REVIEW', true, String(attempt._id), provider)], { session });
          return;
        }

        currentAttempt.state = 'SUCCEEDED';
        currentAttempt.paidAt = new Date();
        currentAttempt.matchedEventId = payload.id;
        await currentAttempt.save({ session });

        await this.events.create([this.eventDoc(payload, rawBody, 'MATCHED', true, String(currentAttempt._id), provider)], { session });
        await this.audit.record('payment.webhook.matched', 'payment_attempt', String(currentAttempt._id), undefined,
          { eventId: payload.id, amount: payload.transferAmount }, session);

        const orderDoc = await this.orderDocs.findById(currentAttempt.orderId).session(session).lean().exec();
        await this.outbox.create(
          [{
            eventId: randomUUID(),
            type: 'payment.verified',
            occurredAt: new Date(),
            aggregateType: 'payment_attempt',
            aggregateId: String(currentAttempt._id),
            payload: {
              paymentAttemptId: String(currentAttempt._id),
              orderId: String(currentAttempt.orderId),
              customerId: orderDoc ? String(orderDoc.customerId) : undefined,
              code: orderDoc?.code,
              amount: currentAttempt.expectedAmount,
              reconciliationCode: currentAttempt.reconciliationCode,
            },
          }],
          { session },
        );
      });
    } catch (error) {
      this.logger.error('Webhook transaction failed', error instanceof Error ? error.stack : undefined);
      throw new InternalServerErrorException('Webhook processing failed');
    }
  }

  private async handleOutbound(payload: ExtendedWebhookPayload, rawBody: string,
    config: { accountNumber: string; allowSimulated: boolean }, provider: PaymentProvider) {
    if (!config.allowSimulated && payload.source === 'SIMULATED') {
      await this.storeEvent(payload, rawBody, 'IGNORED', true, undefined, provider);
      return;
    }
    if (payload.accountNumber !== config.accountNumber) {
      await this.storeEvent(payload, rawBody, 'UNMATCHED', true, undefined, provider);
      return;
    }

    const codes = extractRefundReconciliationCodes(payload.content ?? '');
    if (codes.length !== 1) {
      await this.storeEvent(payload, rawBody, codes.length === 0 ? 'UNMATCHED' : 'REQUIRES_REVIEW', true, undefined, provider);
      return;
    }

    const refund = await this.refunds.getByReconciliationCode(codes[0]);
    if (!refund || refund.state !== 'APPROVED') {
      await this.storeEvent(payload, rawBody, refund ? 'REQUIRES_REVIEW' : 'UNMATCHED', true, undefined, provider);
      return;
    }

    if (payload.transferAmount !== refund.amount) {
      await this.storeEvent(payload, rawBody, 'REQUIRES_REVIEW', true, undefined, provider);
      return;
    }

    if (!refund.approvedAt || new Date(payload.transactionDate).getTime() < new Date(refund.approvedAt).getTime()) {
      await this.storeEvent(payload, rawBody, 'REQUIRES_REVIEW', true, undefined, provider);
      return;
    }

    const beneficiary = readBeneficiary(refund);
    if (!beneficiary || !payload.counterAccount || !payload.counterBankBin) {
      await this.storeEvent(payload, rawBody, 'REQUIRES_REVIEW', true, undefined, provider);
      return;
    }
    if (payload.counterBankBin !== beneficiary.bankBin || payload.counterAccount !== beneficiary.accountNumber) {
      await this.storeEvent(payload, rawBody, 'REQUIRES_REVIEW', true, undefined, provider);
      return;
    }

    try {
      await withCommerceTransaction(this.connection, async (session) => {
        const dedup = await this.events.findOne({ provider, eventId: payload.id }).session(session).lean().exec();
        if (dedup) return;

        const completed = await this.refunds.completeFromWebhook(
          String(refund._id),
          payload.id,
          payload.referenceCode,
          session,
        );
        await this.events.create(
          [{
            ...this.eventDoc(payload, rawBody, completed ? 'MATCHED' : 'REQUIRES_REVIEW', true, undefined, provider),
            matchedRefundId: String(refund._id),
          }],
          { session },
        );
        if (completed) {
          await this.audit.record('refund.webhook.matched', 'refund', String(refund._id), undefined,
            { eventId: payload.id, amount: payload.transferAmount }, session);
        }
      });
    } catch (error) {
      this.logger.error('Refund webhook transaction failed', error instanceof Error ? error.stack : undefined);
      throw new InternalServerErrorException('Webhook processing failed');
    }
  }

  private rawBody(req: RawBodyRequest<Request>): Buffer {
    if (Buffer.isBuffer(req.rawBody)) return req.rawBody;
    if (typeof req.rawBody === 'string') return Buffer.from(req.rawBody, 'utf8');
    throw new UnauthorizedException('Raw request body is required for webhook verification');
  }

  private async storeEvent(
    payload: WebhookPayload,
    rawBody: string,
    resolution: string,
    signatureVerified: boolean,
    attemptId?: string,
    provider: PaymentProvider = 'GPMPAY',
  ): Promise<void> {
    try {
      await this.events.create(this.eventDoc(payload, rawBody, resolution, signatureVerified, attemptId, provider));
    } catch (error) {
      if (this.isDuplicate(error)) return;
      throw error;
    }
  }

  private eventDoc(payload: WebhookPayload, rawBody: string, resolution: string, signatureVerified: boolean,
    attemptId?: string, provider: PaymentProvider = 'GPMPAY') {
    const counter = payload as ExtendedWebhookPayload;
    return {
      provider,
      eventId: payload.id,
      gateway: payload.gateway,
      accountNumberLast4: payload.accountNumber.slice(-4),
      accountNumberHash: createHash('sha256').update(payload.accountNumber).digest('hex'),
      transferType: payload.transferType,
      transferAmount: payload.transferAmount,
      transactionDate: new Date(payload.transactionDate),
      counterAccountHash: counter.counterAccount ? createHash('sha256').update(counter.counterAccount).digest('hex') : undefined,
      counterAccountLast4: counter.counterAccount?.slice(-4),
      counterBankBin: counter.counterBankBin ?? undefined,
      matchedAttemptId: attemptId,
      referenceCode: payload.referenceCode,
      source: payload.source,
      content: payload.content,
      signatureVerified: provider === 'GPMPAY' && signatureVerified,
      authenticationMethod: provider === 'SEPAY' ? 'API_KEY' : 'HMAC_SHA256',
      payloadDigest: createHash('sha256').update(rawBody).digest('hex'),
      resolution,
    };
  }

  private isDuplicate(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: number }).code === 11000;
  }
}
