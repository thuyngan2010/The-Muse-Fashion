import { UnprocessableEntityException } from '@nestjs/common';
import { type ClientSession, type Model, Types } from 'mongoose';
import { PaymentAttempt, Refund } from './payment.schemas.js';

const ACTIVE_REFUND_STATES = ['PENDING_APPROVAL', 'APPROVED', 'SUCCEEDED'] as const;

/** Writing the attempt makes concurrent refund transactions conflict and retry. */
export async function reserveRefundBudget(
  attempts: Model<PaymentAttempt>,
  refunds: Model<Refund>,
  paymentAttemptId: string,
  paidAmount: number,
  requestedAmount: number | 'REMAINING',
  session: ClientSession,
): Promise<number> {
  const locked = await attempts.updateOne(
    { _id: paymentAttemptId, state: 'SUCCEEDED' },
    { $inc: { refundBudgetVersion: 1 } },
    { session },
  ).exec();
  if (locked.matchedCount !== 1) throw new UnprocessableEntityException('Payment is not eligible for refund');

  const reserved = await refunds.aggregate<{ total: number }>([
    { $match: { paymentAttemptId: new Types.ObjectId(paymentAttemptId), state: { $in: [...ACTIVE_REFUND_STATES] } } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]).session(session).exec();
  const remaining = paidAmount - (reserved[0]?.total ?? 0);
  const amount = requestedAmount === 'REMAINING' ? remaining : requestedAmount;
  if (amount <= 0 || amount > remaining) {
    throw new UnprocessableEntityException('Refund amount exceeds remaining paid balance');
  }
  return amount;
}
