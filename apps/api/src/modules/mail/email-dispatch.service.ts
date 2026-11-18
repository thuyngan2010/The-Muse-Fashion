import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, type ClientSession } from 'mongoose';
import { randomUUID } from 'node:crypto';
import sgMail from '@sendgrid/mail';
import { AppConfig } from '../../common/app-config.js';
import { EmailEvent } from './email-event.schema.js';
import { decryptEmailToken, encryptEmailToken } from './email-token-crypto.util.js';
import { Order, OrderEvent, Shipment } from '../commerce/commerce.schemas.js';
import { ProductVariant } from '../catalog/catalog.schemas.js';
import {
  buildEmailMessage, createMailContext, mapOrderDocument, ORDER_DATA_TEMPLATES, TOKEN_TEMPLATES, type OrderEmailData,
} from './templates/index.js';

const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000];
const MAX_ATTEMPTS = 5;
const REQUEUEABLE_TEMPLATES = ['user.password_changed', 'order.created', 'order.status_changed',
  'payment.succeeded', 'refund.succeeded'];

@Injectable()
export class EmailDispatchService {
  private readonly logger = new Logger(EmailDispatchService.name);

  constructor(
    @InjectModel(EmailEvent.name) private readonly events: Model<EmailEvent>,
    // Chỉ để ĐỌC dữ liệu đơn khi dựng nội dung email; thiếu thì email dùng dữ liệu trong payload.
    @Optional() @InjectModel(Order.name) private readonly orders?: Model<Order>,
    @Optional() @InjectModel(Shipment.name) private readonly shipments?: Model<Shipment>,
    @Optional() @InjectModel(OrderEvent.name) private readonly orderEvents?: Model<OrderEvent>,
    @Optional() @InjectModel(ProductVariant.name) private readonly variants?: Model<ProductVariant>,
  ) {}

  async enqueue(
    template: string,
    to: string,
    dedupKey: string,
    payload: Record<string, unknown>,
    session?: ClientSession,
  ): Promise<void> {
    const tokenPayload = typeof payload.token === 'string';
    const storedPayload = tokenPayload
      ? { ...payload, token: undefined, tokenCiphertext: encryptEmailToken(payload.token as string) }
      : payload;
    const ttlMs = tokenPayload ? 60 * 60_000 : 30 * 24 * 60 * 60_000;
    await this.events.updateOne(
      { dedupKey },
      { $setOnInsert: { dedupKey, to, template, payload: storedPayload, state: 'PENDING', attempts: 0,
        expiresAt: new Date(Date.now() + ttlMs) } },
      { upsert: true, ...(session ? { session } : {}) },
    ).exec();
  }

  async processDue(limit = 20): Promise<number> {
    const now = new Date();
    await this.events.updateMany({ state: 'SENDING', attempts: { $gte: MAX_ATTEMPTS }, leaseUntil: { $lte: now } },
      { $set: { state: 'FAILED', lastError: 'Email dispatch lease expired' },
        $unset: { leaseUntil: 1, leaseId: 1, 'payload.tokenCiphertext': 1 } }).exec();
    if (!AppConfig.optional('SENDGRID_API_KEY') || !AppConfig.optional('SENDGRID_FROM_EMAIL')
      || !AppConfig.optional('PUBLIC_WEB_URL')) return 0;
    await this.requeueConfigurationFailures(now, limit);
    const due = await this.events.find(this.dueFilter(now)).sort({ nextAttemptAt: 1, createdAt: 1 }).limit(limit).exec();
    for (const event of due) await this.dispatchOne(event.dedupKey);
    return due.length;
  }

  private async requeueConfigurationFailures(now: Date, limit: number): Promise<void> {
    const filter = {
      state: 'PERMANENT_FAILURE',
      lastError: 'SendGrid is not configured',
      template: { $in: REQUEUEABLE_TEMPLATES },
      expiresAt: { $gt: now },
    };
    const rows = await this.events.find(filter).select('_id').limit(limit).lean().exec();
    if (!rows.length) return;
    const result = await this.events.updateMany(
      { ...filter, _id: { $in: rows.map((row) => row._id) } },
      { $set: { state: 'PENDING', attempts: 0 }, $unset: { nextAttemptAt: 1, lastError: 1 } },
    ).exec();
    if (result.modifiedCount) this.logger.log(`Requeued ${result.modifiedCount} email events after SendGrid configuration was restored`);
  }

  private dueFilter(now: Date) {
    return {
      attempts: { $lt: MAX_ATTEMPTS },
      $and: [
        { $or: [{ expiresAt: { $gt: now } }, { expiresAt: { $exists: false } }] },
        { $or: [
          { state: 'PENDING', $or: [{ nextAttemptAt: null }, { nextAttemptAt: { $lte: now } }] },
          { state: 'SENDING', leaseUntil: { $lte: now } },
        ] },
      ],
    };
  }

  private async dispatchOne(dedupKey: string): Promise<void> {
    const leaseId = randomUUID();
    const claimed = await this.events.findOneAndUpdate(
      { dedupKey, ...this.dueFilter(new Date()) },
      { $set: { state: 'SENDING', leaseUntil: new Date(Date.now() + 5 * 60_000), leaseId }, $inc: { attempts: 1 } },
      { new: true },
    ).exec();
    if (!claimed) return;

    const key = AppConfig.optional('SENDGRID_API_KEY');
    const from = AppConfig.optional('SENDGRID_FROM_EMAIL');
    if (!key || !from || !AppConfig.optional('PUBLIC_WEB_URL')) {
      await this.events.updateOne({ dedupKey, leaseId }, {
        $set: { state: 'PENDING', lastError: 'Email delivery is not configured', nextAttemptAt: new Date(Date.now() + 60_000) },
        $inc: { attempts: -1 },
        $unset: { leaseUntil: 1, leaseId: 1 },
      }).exec();
      return;
    }

    try {
      const { subject, text, html } = await this.buildMessage(claimed.template, claimed.payload ?? {}, claimed.to);
      sgMail.setApiKey(key);
      const [response] = await sgMail.send({
        to: claimed.to,
        from: { email: from, name: process.env.SENDGRID_FROM_NAME || 'Fashion Commerce' },
        subject,
        text,
        html,
        trackingSettings: {
          clickTracking: { enable: false },
          openTracking: { enable: false },
        },
      });
      const providerId = response.headers['x-message-id'] as string | undefined;
      await this.events.updateOne({ dedupKey, leaseId }, { $set: { state: 'SENT', providerId },
        $unset: { lastError: 1, leaseUntil: 1, leaseId: 1, nextAttemptAt: 1, 'payload.tokenCiphertext': 1 } }).exec();
    } catch (error: unknown) {
      const status = typeof error === 'object' && error && 'code' in error ? Number(error.code) : 0;
      const permanent = status >= 400 && status < 500 && status !== 429;
      const message = error instanceof Error ? error.message : 'Send failed';
      await this.failAttempt(claimed, message, !permanent);
      if (permanent) this.logger.warn(`Email ${dedupKey} permanent failure (${status})`);
    }
  }

  private async failAttempt(event: EmailEvent, message: string, retry: boolean): Promise<void> {
    const attempts = event.attempts;
    const lastError = message.slice(0, 500);
    if (!retry || attempts >= MAX_ATTEMPTS) {
      await this.events.updateOne({ dedupKey: event.dedupKey, leaseId: event.leaseId }, {
        $set: { state: retry ? 'FAILED' : 'PERMANENT_FAILURE', lastError },
        $unset: { leaseUntil: 1, leaseId: 1, nextAttemptAt: 1, 'payload.tokenCiphertext': 1 },
      }).exec();
      return;
    }
    const delay = RETRY_DELAYS_MS[Math.min(attempts - 1, RETRY_DELAYS_MS.length - 1)];
    const jitter = Math.floor(Math.random() * 15_000);
    await this.events.updateOne({ dedupKey: event.dedupKey, leaseId: event.leaseId }, {
      $set: { state: 'PENDING', lastError, nextAttemptAt: new Date(Date.now() + delay + jitter) },
      $unset: { leaseUntil: 1, leaseId: 1 },
    }).exec();
  }

  private async buildMessage(template: string, payload: Record<string, unknown>, to?: string): Promise<{ subject: string; text: string; html: string }> {
    const ctx = createMailContext(AppConfig.require('PUBLIC_WEB_URL'), (name) => AppConfig.optional(name));
    const input = TOKEN_TEMPLATES.has(template) ? { ...payload, token: this.tokenFromPayload(payload) } : payload;
    const order = ORDER_DATA_TEMPLATES.has(template) ? await this.loadOrderData(payload) : undefined;
    return buildEmailMessage(template, input, ctx, to, order);
  }

  /** Đọc (không ghi) đơn hàng để làm giàu email. Lỗi hoặc không tìm thấy thì trả undefined. */
  private async loadOrderData(payload: Record<string, unknown>): Promise<OrderEmailData | undefined> {
    const orderId = payload.orderId ? String(payload.orderId) : '';
    if (!this.orders || !Types.ObjectId.isValid(orderId)) return undefined;
    try {
      const order = await this.orders.findById(orderId).lean().exec() as unknown as Record<string, unknown> | null;
      if (!order) return undefined;
      const variantIds = (Array.isArray(order.items) ? order.items as Array<Record<string, unknown>> : [])
        .map((item) => String(item.variantId ?? '')).filter((id) => Types.ObjectId.isValid(id));
      const to = payload.to ? String(payload.to) : '';
      const [variantRows, shipment, event] = await Promise.all([
        this.variants && variantIds.length
          ? this.variants.find({ _id: { $in: variantIds } }).select('color size').lean().exec() : Promise.resolve([]),
        this.shipments ? this.shipments.findOne({ orderId }).select('carrier trackingCode').lean().exec() : Promise.resolve(null),
        this.orderEvents && to ? this.orderEvents.findOne({ orderId, to }).sort({ createdAt: -1 }).select('reason').lean().exec() : Promise.resolve(null),
      ]);
      const variants = new Map((variantRows as Array<{ _id: unknown; color?: string; size?: string }>)
        .map((row) => [String(row._id), { color: row.color, size: row.size }]));
      return mapOrderDocument(order, {
        variants,
        shipment: shipment as { carrier?: string; trackingCode?: string } | null,
        reason: (event as { reason?: string } | null)?.reason,
      });
    } catch {
      return undefined;
    }
  }

  private tokenFromPayload(payload: Record<string, unknown>): string {
    if (typeof payload.token === 'string') return payload.token;
    return decryptEmailToken(String(payload.tokenCiphertext ?? ''));
  }
}
