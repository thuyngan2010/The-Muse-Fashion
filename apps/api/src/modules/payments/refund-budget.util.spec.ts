import { describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';
import { reserveRefundBudget } from './refund-budget.util.js';

describe('refund budget reservation', () => {
  it('matches ObjectId in the aggregation and rejects an over-refund', async () => {
    const attemptId = new Types.ObjectId();
    const session = {} as never;
    const execUpdate = vi.fn().mockResolvedValue({ matchedCount: 1 });
    const updateOne = vi.fn().mockReturnValue({ exec: execUpdate });
    const execAggregate = vi.fn().mockResolvedValue([{ total: 80 }]);
    const aggregate = vi.fn().mockReturnValue({ session: vi.fn().mockReturnValue({ exec: execAggregate }) });
    const attempts = { updateOne } as never;
    const refunds = { aggregate } as never;
    await expect(reserveRefundBudget(attempts, refunds, String(attemptId), 100, 30, session)).rejects.toThrow();
    expect(aggregate.mock.calls[0][0][0].$match.paymentAttemptId).toEqual(attemptId);
    expect(updateOne).toHaveBeenCalledWith({ _id: String(attemptId), state: 'SUCCEEDED' },
      { $inc: { refundBudgetVersion: 1 } }, { session });
  });
});
