import { afterEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { SepayWebhookService } from './sepay-webhook.service.js';

afterEach(() => vi.unstubAllEnvs());

function setup() {
  vi.stubEnv('PAYMENT_PROVIDER', 'SEPAY');
  vi.stubEnv('SEPAY_WEBHOOK_API_KEY', 'secret-key');
  vi.stubEnv('SEPAY_BANK_BIN', '970422');
  vi.stubEnv('SEPAY_ACCOUNT_NUMBER', '0123456789');
  vi.stubEnv('SEPAY_ACCOUNT_NAME', 'MERCHANT');
  const handleVerified = vi.fn().mockResolvedValue(undefined);
  const service = new SepayWebhookService({ handleVerified } as never);
  const input = {
    id: 92704, gateway: 'MB', transactionDate: '2026-10-25 11:08:33',
    accountNumber: '0123456789', content: 'FCABCDEFGH', transferType: 'in',
    transferAmount: 100_000, referenceCode: 'BANK-1',
  };
  return { service, handleVerified, input };
}

describe('SePay webhook adapter', () => {
  it('requires the exact API Key header before handling a payment', async () => {
    const { service, handleVerified, input } = setup();
    await expect(service.handle({ body: input } as never, 'Bearer secret-key')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(handleVerified).not.toHaveBeenCalled();
  });

  it('rejects calls while GPM Pay is the active provider', async () => {
    const { service, handleVerified, input } = setup();
    vi.stubEnv('PAYMENT_PROVIDER', 'GPMPAY');
    await expect(service.handle({ body: input } as never, 'Apikey secret-key')).rejects.toMatchObject({ status: 404 });
    expect(handleVerified).not.toHaveBeenCalled();
  });

  it('normalizes the documented payload and local bank time', async () => {
    const { service, handleVerified, input } = setup();
    const result = await service.handle({ body: input, rawBody: Buffer.from(JSON.stringify(input)) } as never, 'Apikey secret-key');
    expect(result).toEqual({ success: true });
    expect(handleVerified).toHaveBeenCalledWith(expect.objectContaining({
      id: '92704', transactionDate: '2026-10-25T04:08:33.000Z',
      transferAmount: 100_000, source: 'REAL',
    }), JSON.stringify(input), 'SEPAY', { accountNumber: '0123456789', allowSimulated: false });
  });

  it('rejects malformed amounts and transaction identifiers', async () => {
    const { service, handleVerified, input } = setup();
    await expect(service.handle({ body: { ...input, transferAmount: '100000' } } as never, 'Apikey secret-key'))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(service.handle({ body: { ...input, id: 0 } } as never, 'Apikey secret-key'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(handleVerified).not.toHaveBeenCalled();
  });
});
