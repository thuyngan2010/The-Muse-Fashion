import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import type { WebhookPayload } from '@gpmpay/sdk';
import { readSepayConfig } from './sepay.config.js';
import { assertActivePaymentProvider } from './payment-provider.config.js';
import { GpmpayWebhookService } from './gpmpay-webhook.service.js';

@Injectable()
export class SepayWebhookService {
  constructor(private readonly payments: GpmpayWebhookService) {}

  async handle(req: RawBodyRequest<Request>, authorization: string | undefined): Promise<{ success: true }> {
    assertActivePaymentProvider('SEPAY');
    const config = readSepayConfig();
    const expected = createHash('sha256').update(`Apikey ${config.webhookApiKey}`).digest();
    const actual = createHash('sha256').update(authorization ?? '').digest();
    if (!timingSafeEqual(actual, expected)) throw new UnauthorizedException('Invalid SePay webhook API key');

    const input = req.body as Record<string, unknown> | null;
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BadRequestException('Invalid SePay webhook payload');
    if (input.test === true) return { success: true };

    const payload = this.parse(input);
    const rawBody = Buffer.isBuffer(req.rawBody) ? req.rawBody.toString('utf8') : JSON.stringify(input);
    await this.payments.handleVerified(payload, rawBody, 'SEPAY', { accountNumber: config.accountNumber, allowSimulated: false });
    return { success: true };
  }

  private parse(input: Record<string, unknown>): WebhookPayload {
    const id = input.id;
    const amount = input.transferAmount;
    const transferType = input.transferType;
    const accountNumber = input.accountNumber;
    const content = input.content;
    const gateway = input.gateway;
    const referenceCode = input.referenceCode;
    const dateString = input.transactionDate;
    const date = typeof dateString === 'string'
      ? new Date(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(dateString)
        ? `${dateString.replace(' ', 'T')}+07:00` : dateString)
      : new Date(NaN);
    if (!Number.isSafeInteger(id) || Number(id) <= 0 || !Number.isSafeInteger(amount) || Number(amount) <= 0
      || (transferType !== 'in' && transferType !== 'out')
      || typeof accountNumber !== 'string' || !accountNumber.trim()
      || typeof content !== 'string' || content.length > 2000
      || typeof gateway !== 'string' || !gateway.trim()
      || typeof dateString !== 'string' || !Number.isFinite(date.getTime())
      || (referenceCode != null && typeof referenceCode !== 'string')) {
      throw new BadRequestException('Invalid SePay webhook payload');
    }
    return {
      id: String(id), gateway, transactionDate: date.toISOString(), accountNumber,
      content, transferType, transferAmount: Number(amount), referenceCode: String(referenceCode ?? ''),
      source: 'REAL',
    } as WebhookPayload;
  }
}
