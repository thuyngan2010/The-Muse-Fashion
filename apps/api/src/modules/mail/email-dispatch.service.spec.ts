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
});
