import { describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { RefundService } from './refund.service.js';

describe('RefundService.list', () => {
  it('adds orderCode and proposedByName without leaking beneficiary data', async () => {
    const orderId = new Types.ObjectId(), proposer = new Types.ObjectId();
    const rows = [{ _id: new Types.ObjectId(), paymentAttemptId: new Types.ObjectId(), orderId, amount: 100_000, state: 'PENDING_APPROVAL', reason: 'Hết hàng', proposedBy: proposer }];
    const refunds = {
      find: () => ({ select: () => ({ sort: () => ({ skip: () => ({ limit: () => ({ lean: () => ({ exec: async () => rows }) }) }) }) }) }),
      countDocuments: () => ({ exec: async () => 1 }),
    };
    const orders = { find: () => ({ select: () => ({ lean: () => ({ exec: async () => [{ _id: orderId, code: 'MUSE-0001' }] }) }) }) };
    const users = { displayNames: async () => new Map([[String(proposer), 'Lê Chi']]) };
    const service = new RefundService({} as never, refunds as never, {} as never, orders as never, {} as never, {} as never, {} as never, users as never);
    const res = await service.list(String(proposer), 'ADMIN');
    expect(res.items[0]).toMatchObject({ orderCode: 'MUSE-0001', proposedByName: 'Lê Chi' });
    expect(JSON.stringify(res)).not.toMatch(/accountNumber"|passwordHash/);
  });
});
