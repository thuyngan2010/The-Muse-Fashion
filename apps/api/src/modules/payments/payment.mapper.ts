import type { PaymentAttempt } from './payment.schemas.js';
import type { GpmpayMerchantConfig } from './gpmpay.config.js';
import type { SepayMerchantConfig } from './sepay.config.js';
import { maskAccountNumber } from './reconciliation.util.js';

type AttemptDoc = PaymentAttempt & { _id: unknown; createdAt?: Date };

export function serializePaymentAttempt(
  attempt: AttemptDoc,
  bank?: GpmpayMerchantConfig | SepayMerchantConfig,
) {
  return {
    id: String(attempt._id),
    orderId: String(attempt.orderId),
    provider: attempt.provider as 'GPMPAY' | 'SEPAY',
    state: attempt.state,
    amount: attempt.expectedAmount,
    currency: 'VND' as const,
    reconciliationCode: attempt.reconciliationCode,
    expiresAt: attempt.expiresAt.toISOString(),
    paidAt: attempt.paidAt?.toISOString() ?? null,
    ...(bank ? { bank: {
      bin: bank.bankBin,
      accountNumberMasked: maskAccountNumber(bank.accountNumber),
      accountName: bank.accountName,
    } } : {}),
  };
}
