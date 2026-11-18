import 'reflect-metadata';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EmailDispatchService } from './email-dispatch.service.js';

afterEach(() => vi.unstubAllEnvs());

describe('EmailDispatchService configuration recovery', () => {
  it.each(['SENDGRID_API_KEY', 'SENDGRID_FROM_EMAIL', 'PUBLIC_WEB_URL'])
  ('does not consume attempts while %s is missing', async (missing) => {
    vi.stubEnv('SENDGRID_API_KEY', 'test-key');
    vi.stubEnv('SENDGRID_FROM_EMAIL', 'sender@example.test');
    vi.stubEnv('PUBLIC_WEB_URL', 'https://shop.example.test');
    vi.stubEnv(missing, '');
    const events = {
      updateMany: vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue({ modifiedCount: 0 }) }),
      find: vi.fn(),
    };
    expect(await new EmailDispatchService(events as never).processDue()).toBe(0);
    expect(events.find).not.toHaveBeenCalled();
  });

  it('requeues only unexpired, token-free historical configuration failures', async () => {
    vi.stubEnv('SENDGRID_API_KEY', 'test-key');
    vi.stubEnv('SENDGRID_FROM_EMAIL', 'sender@example.test');
    vi.stubEnv('PUBLIC_WEB_URL', 'https://shop.example.test');
    const historical = { _id: 'event-id' };
    const events = {
      updateMany: vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue({ modifiedCount: 1 }) }),
      find: vi.fn()
        .mockReturnValueOnce({ select: () => ({ limit: () => ({ lean: () => ({ exec: async () => [historical] }) }) }) })
        .mockReturnValueOnce({ sort: () => ({ limit: () => ({ exec: async () => [] }) }) }),
    };
    expect(await new EmailDispatchService(events as never).processDue()).toBe(0);
    expect(events.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        state: 'PERMANENT_FAILURE', lastError: 'SendGrid is not configured',
        template: { $in: ['user.password_changed', 'order.created', 'order.status_changed',
          'payment.succeeded', 'refund.succeeded'] },
      }),
      expect.objectContaining({ $set: { state: 'PENDING', attempts: 0 } }),
    );
  });

  type Built = { subject: string; text: string; html: string };
  type Builder = (t: string, p: Record<string, unknown>, to?: string) => Promise<Built>;
  const builder = (service: EmailDispatchService) => (service as unknown as { buildMessage: Builder }).buildMessage.bind(service);

  it.each(['user.verify_email', 'user.reset_password', 'staff.invite'])('builds html and text with the decrypted link for %s', async (template) => {
    vi.stubEnv('PUBLIC_WEB_URL', 'https://shop.example.test');
    vi.stubEnv('MAIL_SUPPORT_EMAIL', 'help@shop.example.test');
    const message = await builder(new EmailDispatchService({} as never))(template, { token: 'tok-1' }, 'person@example.test');
    expect(message.html).toContain('token=tok-1');
    expect(message.text).toContain('token=tok-1');
    expect(message.html).toContain('help@shop.example.test');
  });

  it('builds order emails from payload alone when the order models are not available', async () => {
    vi.stubEnv('PUBLIC_WEB_URL', 'https://shop.example.test');
    const message = await builder(new EmailDispatchService({} as never))('payment.succeeded', { orderId: 'o1', amount: 1000 });
    expect(message.subject).toContain('Thanh toán thành công');
    expect(message.html).toContain('1.000đ');
  });

  it('enriches order emails with the order read from the database', async () => {
    vi.stubEnv('PUBLIC_WEB_URL', 'https://shop.example.test');
    const id = '65f0c0ffee0000000000a001';
    const lean = (value: unknown) => ({ select: () => ({ lean: () => ({ exec: async () => value }) }), lean: () => ({ exec: async () => value }) });
    const orders = { findById: vi.fn().mockReturnValue(lean({
      _id: id, code: 'FC123', state: 'SHIPPING', items: [{ productName: 'Áo A', variantId: id, quantity: 1, unitPrice: 1000, lineTotal: 1000 }],
      money: { subtotal: 1000, shippingFee: 0, voucherDiscount: 0, payableTotal: 1000 },
    })) };
    const shipments = { findOne: vi.fn().mockReturnValue(lean({ carrier: 'GHN', trackingCode: 'TRK1' })) };
    const orderEvents = { findOne: vi.fn().mockReturnValue({ sort: () => lean(null) }) };
    const variants = { find: vi.fn().mockReturnValue(lean([{ _id: id, color: 'Đen', size: 'M' }])) };
    const service = new EmailDispatchService({} as never, orders as never, shipments as never, orderEvents as never, variants as never);
    const message = await builder(service)('order.status_changed', { orderId: id, code: 'FC123', to: 'SHIPPING' });
    expect(message.subject).toBe('Đơn #FC123 đang trên đường giao đến bạn');
    expect(message.html).toContain('GHN');
    expect(message.text).toContain('TRK1');
  });

  it('falls back to the payload when reading the order fails', async () => {
    vi.stubEnv('PUBLIC_WEB_URL', 'https://shop.example.test');
    const orders = { findById: vi.fn().mockImplementation(() => { throw new Error('db down'); }) };
    const service = new EmailDispatchService({} as never, orders as never);
    const message = await builder(service)('order.created', { orderId: '65f0c0ffee0000000000a001', code: 'FC9', payableTotal: 1250000 });
    expect(message.subject).toBe('MUSE đã nhận đơn hàng #FC9');
    expect(message.text).toContain('1.250.000đ');
  });
});
