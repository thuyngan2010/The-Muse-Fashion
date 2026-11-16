import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, type ClientSession } from 'mongoose';
import { randomUUID } from 'node:crypto';
import sgMail from '@sendgrid/mail';
import { AppConfig } from '../../common/app-config.js';
import { EmailEvent } from './email-event.schema.js';
import { decryptEmailToken, encryptEmailToken } from './email-token-crypto.util.js';

const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000];
const MAX_ATTEMPTS = 5;
const REQUEUEABLE_TEMPLATES = ['user.password_changed', 'order.created', 'order.status_changed',
  'payment.succeeded', 'refund.succeeded'];

@Injectable()
export class EmailDispatchService {
  private readonly logger = new Logger(EmailDispatchService.name);

  constructor(@InjectModel(EmailEvent.name) private readonly events: Model<EmailEvent>) {}

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
      const { subject, text } = this.buildMessage(claimed.template, claimed.payload ?? {});
      sgMail.setApiKey(key);
      const [response] = await sgMail.send({
        to: claimed.to,
        from: { email: from, name: process.env.SENDGRID_FROM_NAME || 'Fashion Commerce' },
        subject,
        text,
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

  private buildMessage(template: string, payload: Record<string, unknown>): { subject: string; text: string } {
    const baseUrl = AppConfig.require('PUBLIC_WEB_URL').replace(/\/$/, '');
    if (template === 'user.verify_email') {
      const token = this.tokenFromPayload(payload);
      const url = `${baseUrl}/verify-email?token=${encodeURIComponent(token)}`;
      return {
        subject: 'Xác minh email tài khoản',
        text: `Vui lòng truy cập đường dẫn để xác minh email: ${url}\nĐường dẫn chỉ sử dụng một lần và có thời hạn.`,
      };
    }
    if (template === 'user.reset_password') {
      const token = this.tokenFromPayload(payload);
      const url = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;
      return {
        subject: 'Khôi phục mật khẩu',
        text: `Bạn đã yêu cầu đặt lại mật khẩu. Truy cập: ${url}\nNếu không phải bạn, hãy bỏ qua email này.`,
      };
    }
    if (template === 'user.password_changed') {
      return {
        subject: 'Mật khẩu đã được thay đổi',
        text: 'Mật khẩu tài khoản của bạn vừa được thay đổi. Nếu không phải bạn, hãy liên hệ hỗ trợ ngay.',
      };
    }
    if (template === 'order.created') {
      const code = String(payload.code ?? payload.orderId ?? '');
      const total = Number(payload.payableTotal ?? 0).toLocaleString('vi-VN');
      return {
        subject: `Xác nhận đơn hàng ${code}`,
        text: `Đơn ${code} đã được tạo với tổng thanh toán ${total} VND.\nXem đơn: ${baseUrl}/account/orders/${String(payload.orderId ?? '')}`,
      };
    }
    if (template === 'order.status_changed') {
      const code = String(payload.code ?? payload.orderId ?? '');
      return {
        subject: `Cập nhật đơn ${code}`,
        text: `Đơn ${code} chuyển từ ${String(payload.from ?? '-')} sang ${String(payload.to ?? '-')}.\nXem chi tiết: ${baseUrl}/account/orders/${String(payload.orderId ?? '')}`,
      };
    }
    if (template === 'payment.succeeded') {
      const amount = Number(payload.amount ?? 0).toLocaleString('vi-VN');
      return {
        subject: 'Thanh toán đơn hàng thành công',
        text: `Thanh toán ${amount} VND đã được ghi nhận cho đơn ${String(payload.orderId ?? '')}.`,
      };
    }
    if (template === 'refund.succeeded') {
      const amount = Number(payload.amount ?? 0).toLocaleString('vi-VN');
      return {
        subject: 'Hoàn tiền đã được ghi nhận',
        text: `Khoản hoàn ${amount} VND đã được xử lý. Mã tham chiếu ngân hàng: ${String(payload.bankReference ?? 'N/A')}.`,
      };
    }
    return { subject: 'Thông báo', text: 'Bạn có thông báo mới từ Fashion Commerce.' };
  }

  private tokenFromPayload(payload: Record<string, unknown>): string {
    if (typeof payload.token === 'string') return payload.token;
    return decryptEmailToken(String(payload.tokenCiphertext ?? ''));
  }
}
