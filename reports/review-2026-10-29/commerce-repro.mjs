// Read-only service reproduction: no network, database or application .env.
// Run from repository root after npm run build:api.
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { RefundService } from '../../apps/api/dist/modules/payments/refund.service.js';
import { PaymentService } from '../../apps/api/dist/modules/payments/payment.service.js';
import { RefundSchema } from '../../apps/api/dist/modules/payments/payment.schemas.js';

const q = value => {
  const query = { select: () => query, session: () => query, lean: () => query, exec: async () => value };
  return query;
};
const session = { withTransaction: async callback => callback(), endSession: async () => {} };
const connection = { startSession: async () => session };
const noop = async () => {};
const orderId = '657000000000000000000001';
const customerId = '657000000000000000000002';
const approverId = '657000000000000000000003';
const attemptId = '657000000000000000000004';

// One 50,000 transfer reference is accepted as settlement for two 50,000 refunds.
const refunds = [5, 6].map(n => ({
  _id: `65700000000000000000000${n}`, paymentAttemptId: attemptId, orderId,
  proposedBy: customerId, state: 'APPROVED', amount: 50_000, reason: 'audit reproduction',
  save: noop,
}));
const order = { _id: orderId, customerId, state: 'CANCEL_PENDING_REFUND', version: 1, save: noop };
const outbox = [];
const refundModel = {
  findById: id => q(refunds.find(row => row._id === id)),
  aggregate: () => q([{ total: refunds.filter(row => row.state === 'SUCCEEDED').reduce((sum, row) => sum + row.amount, 0) }]),
};
const refundService = new RefundService(connection, refundModel,
  { findById: () => q({ _id: attemptId, expectedAmount: 100_000 }) },
  { findOneAndUpdate: () => q(order), findById: () => q(order) },
  { create: async rows => outbox.push(...rows) }, { record: noop },
  { assertRefundEvidenceReady: noop }, {});
const bankReference = 'ONE-REAL-TRANSFER-OF-50000';
for (const refund of refunds) {
  await refundService.completeManual(refund._id, approverId, randomUUID(), {
    bankReference, evidenceObjectKey: 'refund_evidence/one-transfer.png',
  });
}
assert.deepEqual(refunds.map(row => row.state), ['SUCCEEDED', 'SUCCEEDED']);
assert.equal(order.state, 'CANCELLED');
assert.equal(RefundSchema.indexes().some(([fields, options]) => fields.bankReference && options.unique), false);
console.log(JSON.stringify({ case: 'duplicate_manual_refund_bank_reference',
  accepted: refunds.map(row => ({ state: row.state, amount: row.amount, bankReference: row.bankReference })),
  orderState: order.state, refundCompletedEvents: outbox.length, bankReferenceUniqueIndex: false }, null, 2));

// Pending attempt from an inactive provider advertises retry, while create rejects it.
process.env.PAYMENT_PROVIDER = 'SEPAY';
process.env.SEPAY_WEBHOOK_API_KEY = 'audit-test-key';
process.env.SEPAY_BANK_BIN = '970422';
process.env.SEPAY_ACCOUNT_NUMBER = '0123456789';
process.env.SEPAY_ACCOUNT_NAME = 'AUDIT TEST';
const dueAt = new Date(Date.now() + 600_000);
const pendingOrder = { _id: orderId, customerId, state: 'PENDING_PAYMENT', paymentDueAt: dueAt,
  money: { payableTotal: 100_000 } };
const pendingAttempt = { _id: attemptId, orderId, provider: 'GPMPAY', state: 'PENDING', expiresAt: dueAt,
  expectedAmount: 100_000, reconciliationCode: 'FCABCDEF12' };
const paymentService = new PaymentService({
  findById: () => q(pendingAttempt),
  findOne: filter => q(filter.state === 'PENDING' ? pendingAttempt : null),
}, { findById: () => q(pendingOrder), findOneAndUpdate: () => q(pendingOrder) }, {}, connection);
const detail = await paymentService.getPayment(attemptId, { sub: customerId, role: 'CUSTOMER' });
assert.equal(detail.canRetry, true);
let retryError;
try { await paymentService.createAttempt(customerId, randomUUID(), { orderId }); }
catch (error) { retryError = { status: error.getStatus(), message: error.message }; }
assert.equal(retryError.status, 409);
console.log(JSON.stringify({ case: 'inactive_provider_retry_contract', canRetry: detail.canRetry, retryError }, null, 2));
