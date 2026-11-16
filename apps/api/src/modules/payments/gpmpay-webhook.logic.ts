export type WebhookMatchDecision =
  | 'ACK_DUPLICATE'
  | 'IGNORE_TEST'
  | 'IGNORE_SIMULATED'
  | 'IGNORE_OUT'
  | 'UNMATCHED'
  | 'REQUIRES_REVIEW'
  | 'AUTO_MATCH';

export function decideInboundWebhook(input: {
  duplicateEvent: boolean;
  testEnvelope: boolean;
  transferType: 'in' | 'out';
  source: 'REAL' | 'SIMULATED';
  allowSimulated: boolean;
  accountMatches: boolean;
  reconciliationCodes: string[];
  attemptFound: boolean;
  attemptState: string | null;
  transferAmount: number;
  expectedAmount: number | null;
  attemptExpired: boolean;
  orderPendingPayment: boolean;
}): WebhookMatchDecision {
  if (input.duplicateEvent) return 'ACK_DUPLICATE';
  if (input.testEnvelope) return 'IGNORE_TEST';
  if (input.transferType !== 'in') return 'IGNORE_OUT';
  if (!input.allowSimulated && input.source === 'SIMULATED') return 'IGNORE_SIMULATED';
  if (!input.accountMatches) return 'UNMATCHED';
  if (input.reconciliationCodes.length !== 1) {
    return input.reconciliationCodes.length === 0 ? 'UNMATCHED' : 'REQUIRES_REVIEW';
  }
  if (!input.attemptFound) return 'UNMATCHED';
  if (input.attemptState === 'SUCCEEDED') return 'ACK_DUPLICATE';
  if (input.expectedAmount == null || input.transferAmount !== input.expectedAmount) return 'REQUIRES_REVIEW';
  if (input.attemptState !== 'PENDING' || input.attemptExpired || !input.orderPendingPayment) return 'REQUIRES_REVIEW';
  return 'AUTO_MATCH';
}
