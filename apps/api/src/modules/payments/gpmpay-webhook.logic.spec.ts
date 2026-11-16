import { describe, expect, it } from 'vitest';
import { decideInboundWebhook } from './gpmpay-webhook.logic.js';

const base = {
  duplicateEvent: false,
  testEnvelope: false,
  transferType: 'in' as const,
  source: 'REAL' as const,
  allowSimulated: false,
  accountMatches: true,
  reconciliationCodes: ['FCABCDEF12'],
  attemptFound: true,
  attemptState: 'PENDING',
  transferAmount: 100_000,
  expectedAmount: 100_000,
  attemptExpired: false,
  orderPendingPayment: true,
};

describe('decideInboundWebhook', () => {
  it('auto-matches a valid inbound transfer (TC-UC27-01)', () => {
    expect(decideInboundWebhook(base)).toBe('AUTO_MATCH');
  });

  it('acks duplicate provider events without side effects (TC-UC27-03)', () => {
    expect(decideInboundWebhook({ ...base, duplicateEvent: true })).toBe('ACK_DUPLICATE');
    expect(decideInboundWebhook({ ...base, attemptState: 'SUCCEEDED' })).toBe('ACK_DUPLICATE');
  });

  it('routes wrong amounts to manual review (TC-UC27-05)', () => {
    expect(decideInboundWebhook({ ...base, transferAmount: 99_000 })).toBe('REQUIRES_REVIEW');
  });

  it('routes late webhooks after expiry/cancel to review (TC-UC27-04)', () => {
    expect(decideInboundWebhook({ ...base, attemptExpired: true })).toBe('REQUIRES_REVIEW');
    expect(decideInboundWebhook({ ...base, orderPendingPayment: false })).toBe('REQUIRES_REVIEW');
    expect(decideInboundWebhook({ ...base, attemptState: 'FAILED' })).toBe('REQUIRES_REVIEW');
  });
});
