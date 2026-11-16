import { maskAccountNumber } from './reconciliation.util.js';
import { readBeneficiary } from './beneficiary-crypto.util.js';
import type { Refund } from './payment.schemas.js';

type RefundDoc = Refund & { _id: unknown };

export function serializeRefund(refund: RefundDoc, options?: { includeQr?: boolean; qrImageUrl?: string }) {
  const beneficiary = readBeneficiary(refund);
  return {
    id: String(refund._id),
    paymentAttemptId: String(refund.paymentAttemptId),
    orderId: String(refund.orderId),
    amount: refund.amount,
    state: refund.state,
    reason: refund.reason,
    failureReason: refund.failureReason,
    createdAt: (refund as Refund & { createdAt?: Date }).createdAt?.toISOString(),
    proposedBy: String(refund.proposedBy),
    approvedBy: refund.approvedBy ? String(refund.approvedBy) : undefined,
    confirmedBy: refund.confirmedBy ? String(refund.confirmedBy) : undefined,
    bankReference: refund.bankReference,
    reconciliationCode: refund.reconciliationCode,
    transferContent: refund.transferContent,
    approvedAt: refund.approvedAt?.toISOString(),
    refundedAt: refund.refundedAt?.toISOString(),
    beneficiary: beneficiary
      ? {
          bankBin: beneficiary.bankBin,
          accountNumberMasked: maskAccountNumber(beneficiary.accountNumber),
          accountName: beneficiary.accountName,
        }
      : undefined,
    ...(options?.includeQr && options.qrImageUrl ? { qrImageUrl: options.qrImageUrl } : {}),
  };
}
