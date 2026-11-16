import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Types } from 'mongoose';
import { PaymentService } from './payment.service.js';

const query = (value: unknown) => ({ session: () => ({ lean: () => ({ exec: async () => value }) }) });

function connection() {
  const session = { withTransaction: async (callback: () => Promise<void>) => callback(),
    endSession: async () => undefined };
  return { session, connection: { startSession: async () => session } };
}

afterEach(() => vi.unstubAllEnvs());

describe('PaymentService creation', () => {
  it('rejects a legacy zero-value order before creating or replaying a pending bank attempt', async () => {
    const orderId = new Types.ObjectId().toString();
    const customerId = new Types.ObjectId().toString();
    const order = { _id: orderId, customerId, state: 'PENDING_PAYMENT',
      paymentDueAt: new Date(Date.now() + 600_000), money: { payableTotal: 0 } };
    const attempts = { findOne: vi.fn().mockReturnValue(query(null)), create: vi.fn() };
    const conditionalWrite = vi.fn();
    const orders = { findById: vi.fn().mockReturnValue(query(order)), findOneAndUpdate: conditionalWrite };
    const { connection: db } = connection();
    const service = new PaymentService(attempts as never, orders as never, {} as never, db as never);
    await expect(service.createAttempt(customerId, randomUUID(), { orderId }))
      .rejects.toMatchObject({ response: { code: 'ZERO_PAYABLE_NOT_SUPPORTED' } });
    expect(conditionalWrite).not.toHaveBeenCalled();
    expect(attempts.create).not.toHaveBeenCalled();
  });

  it('does not return a QR for a pending attempt after the order payment window closes', async () => {
    const orderId = new Types.ObjectId().toString();
    const customerId = new Types.ObjectId().toString();
    const expiresAt = new Date(Date.now() - 60_000);
    const order = { _id: orderId, customerId, state: 'PENDING_PAYMENT', paymentDueAt: expiresAt };
    const replay = { orderId, state: 'PENDING', expiresAt, reconciliationCode: 'ABC', expectedAmount: 100_000 };
    const attempts = { findOne: vi.fn().mockReturnValue(query(replay)), create: vi.fn() };
    const orders = { findById: vi.fn().mockReturnValue(query(order)),
      findOneAndUpdate: vi.fn().mockReturnValue({ lean: () => ({ exec: async () => null }) }) };
    const { connection: db } = connection();
    const service = new PaymentService(attempts as never, orders as never, {} as never, db as never);

    await expect(service.createAttempt(customerId, randomUUID(), { orderId }))
      .rejects.toBeInstanceOf(ConflictException);
    expect(attempts.create).not.toHaveBeenCalled();
  });

  it('does not create an attempt when the order changes before the conditional write', async () => {
    const orderId = new Types.ObjectId().toString();
    const customerId = new Types.ObjectId().toString();
    const order = { _id: orderId, customerId, state: 'PENDING_PAYMENT',
      paymentDueAt: new Date(Date.now() + 600_000) };
    const attempts = { findOne: vi.fn().mockReturnValue(query(null)), create: vi.fn() };
    const conditionalWrite = vi.fn().mockReturnValue({ lean: () => ({ exec: async () => null }) });
    const orders = { findById: vi.fn().mockReturnValue(query(order)), findOneAndUpdate: conditionalWrite };
    const { connection: db } = connection();
    const service = new PaymentService(attempts as never, orders as never, {} as never, db as never);

    await expect(service.createAttempt(customerId, randomUUID(), { orderId }))
      .rejects.toBeInstanceOf(ConflictException);
    expect(conditionalWrite).toHaveBeenCalledWith(expect.objectContaining({
      _id: orderId, customerId, state: 'PENDING_PAYMENT', paymentDueAt: { $gt: expect.any(Date) },
    }), { $inc: { paymentAttemptRevision: 1 } },
    expect.objectContaining({ session: expect.anything(), timestamps: false }));
    expect(attempts.create).not.toHaveBeenCalled();
  });

  it('writes the order fence and attempt in the same MongoDB session', async () => {
    const orderId = new Types.ObjectId().toString();
    const customerId = new Types.ObjectId().toString();
    const dueAt = new Date(Date.now() + 600_000);
    const order = { _id: orderId, customerId, state: 'PENDING_PAYMENT',
      paymentDueAt: dueAt, money: { payableTotal: 100_000 } };
    const attempts = {
      findOne: vi.fn().mockReturnValue(query(null)),
      exists: vi.fn().mockReturnValue({ session: () => ({ exec: async () => null }) }),
      create: vi.fn().mockImplementation(async ([row]) => [{ _id: new Types.ObjectId(), ...row }]),
    };
    const conditionalWrite = vi.fn().mockReturnValue({ lean: () => ({ exec: async () => order }) });
    const orders = { findById: vi.fn().mockReturnValue(query(order)), findOneAndUpdate: conditionalWrite };
    const { connection: db, session } = connection();
    vi.stubEnv('GPMPAY_WEBHOOK_SECRET', 'test-secret');
    vi.stubEnv('GPMPAY_BANK_BIN', '970436');
    vi.stubEnv('GPMPAY_ACCOUNT_NUMBER', '123456789');
    vi.stubEnv('GPMPAY_ACCOUNT_NAME', 'TEST');
    const service = new PaymentService(attempts as never, orders as never, {} as never, db as never);
    vi.spyOn(service as never, 'withQr').mockImplementation((payload: unknown) => payload as never);

    await service.createAttempt(customerId, randomUUID(), { orderId });
    expect(conditionalWrite.mock.calls[0][2]).toMatchObject({ session });
    expect(attempts.create.mock.calls[0][1]).toMatchObject({ session });
  });
});
