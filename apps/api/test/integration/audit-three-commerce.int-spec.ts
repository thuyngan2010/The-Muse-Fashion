import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Types, type Connection } from 'mongoose';
import { authed, connectDb, inboundTransfer, login, seedOrder, seedPaymentAttempt, seedUser,
  sendWebhook, startApi, uniqueDbName, type RunningApi } from './harness.js';

let db: Connection;
let api: RunningApi;
let customer: { id: string; email: string };
let proposer: ReturnType<typeof authed>;
let approver: ReturnType<typeof authed>;
let owner: ReturnType<typeof authed>;
let evidenceKey: string;

beforeAll(async () => {
  const name = uniqueDbName('fc_audit3_commerce');
  db = await connectDb(name);
  api = await startApi(name);
  customer = await seedUser(db, 'CUSTOMER', 'audit3-customer');
  const adminA = await seedUser(db, 'ADMIN', 'audit3-proposer');
  const adminB = await seedUser(db, 'ADMIN', 'audit3-approver');
  proposer = authed(api, (await login(api, adminA.email)).accessToken);
  approver = authed(api, (await login(api, adminB.email)).accessToken);
  owner = authed(api, (await login(api, customer.email)).accessToken);
  evidenceKey = `refund_evidence/${adminB.id}/${randomUUID()}.png`;
  await db.collection('media_objects').insertOne({ key: evidenceKey, ownerId: new Types.ObjectId(adminB.id),
    purpose: 'refund_evidence', visibility: 'PRIVATE', status: 'READY' });
});

afterAll(async () => {
  await api?.stop();
  await db?.dropDatabase();
  await db?.close();
});

async function body(response: Response, status = 200) {
  const result = await response.json();
  expect(response.status, JSON.stringify(result)).toBe(status);
  return result;
}

async function approvedRefunds(amounts: number[]) {
  const order = await seedOrder(db, customer.id, { state: 'CONFIRMED', payableTotal: 100_000 });
  const payment = await seedPaymentAttempt(db, order.id, { state: 'SUCCEEDED', amount: 100_000 });
  const refunds: Array<{ id: string; reconciliationCode: string }> = [];
  for (const amount of amounts) {
    const refund = await body(await proposer('/admin/refunds', { method: 'POST',
      headers: { 'Idempotency-Key': randomUUID() }, body: JSON.stringify({ paymentAttemptId: payment.id, amount,
        reason: 'Concurrent refund regression', beneficiary: { bankBin: '970422',
          accountNumber: '9999999999', accountName: 'AUDIT CUSTOMER' } }) }), 201);
    const approved = await body(await approver(`/admin/refunds/${refund.id}/approve`, {
      method: 'PATCH', headers: { 'Idempotency-Key': randomUUID() },
    }));
    refunds.push(approved);
  }
  return { order, refunds };
}

function cancel(orderId: string) {
  return proposer(`/orders/${orderId}/cancel`, { method: 'POST', headers: { 'Idempotency-Key': randomUUID() },
    body: JSON.stringify({ reason: 'Cancellation after refund proposals' }) });
}

function manualCompletion(refundId: string, key: string, bankReference: string) {
  return approver(`/admin/refunds/${refundId}/complete`, { method: 'PATCH',
    headers: { 'Idempotency-Key': key }, body: JSON.stringify({ bankReference, evidenceObjectKey: evidenceKey }) });
}

describe('Audit 29 October commerce regressions', () => {
  it.each(['manual', 'webhook'])('closes an order after distinct partial refunds finish concurrently (%s)', async (secondMode) => {
    for (let iteration = 0; iteration < 3; iteration++) {
      const { order, refunds } = await approvedRefunds([50_000, 50_000]);
      await body(await cancel(order.id), 201);
      const key = randomUUID();
      const reference = randomUUID();
      const outgoing = { ...inboundTransfer(refunds[1]!.reconciliationCode, 50_000),
        transferType: 'out', counterAccount: '9999999999', counterBankBin: '970422' };
      const secondKey = randomUUID();
      const secondReference = randomUUID();
      const responses = await Promise.all([
        manualCompletion(refunds[0]!.id, key, reference),
        secondMode === 'webhook' ? sendWebhook(api, outgoing)
          : manualCompletion(refunds[1]!.id, secondKey, secondReference),
      ]);
      await body(responses[0]!);
      if (secondMode === 'webhook') expect(responses[1]!.status).toBe(204);
      else await body(responses[1]!);
      const rows = await db.collection('refunds').find({ orderId: new Types.ObjectId(order.id) }).toArray();
      expect(rows.map(row => row.state)).toEqual(['SUCCEEDED', 'SUCCEEDED']);
      expect(rows.reduce((sum, row) => sum + row.amount, 0)).toBe(100_000);
      expect((await db.collection('orders').findOne({ _id: new Types.ObjectId(order.id) }))?.state).toBe('CANCELLED');
      await body(await manualCompletion(refunds[0]!.id, key, reference));
      if (secondMode === 'webhook') expect((await sendWebhook(api, outgoing)).status).toBe(204);
      else await body(await manualCompletion(refunds[1]!.id, secondKey, secondReference));
      expect(await db.collection('outbox_events').countDocuments({ type: 'refund.completed', 'payload.orderId': order.id })).toBe(2);
    }
  });

  it('serializes full refund completion with cancellation even when no new refund budget is reserved', async () => {
    const { order, refunds } = await approvedRefunds([100_000]);
    const responses = await Promise.all([cancel(order.id), manualCompletion(refunds[0]!.id, randomUUID(), randomUUID())]);
    await body(responses[0]!, 201);
    await body(responses[1]!);
    expect((await db.collection('orders').findOne({ _id: new Types.ObjectId(order.id) }))?.state).toBe('CANCELLED');
  });

  it('rejects zero-value quotes and legacy quotes without reserving stock, consuming vouchers or clearing the cart', async () => {
    const addressId = new Types.ObjectId();
    const productId = new Types.ObjectId();
    const variantId = new Types.ObjectId();
    const customerId = new Types.ObjectId(customer.id);
    const voucherCode = 'AUDIT3FREE';
    await db.collection('addresses').insertOne({ _id: addressId, customerId, receiver: 'Audit Customer',
      phone: '0901234567', location: { line1: '1 Test', ward: '1', district: '1', province: 'HCM' } });
    await db.collection('products').insertOne({ _id: productId, slug: randomUUID(), name: 'Free promotion fixture',
      price: 1_000_000, currency: 'VND', status: 'PUBLISHED' });
    await db.collection('product_variants').insertOne({ _id: variantId, productId, sku: randomUUID(),
      price: 1_000_000, stockOnHand: 10, reserved: 0, version: 1, status: 'ACTIVE' });
    await db.collection('carts').insertOne({ customerId, items: [{ variantId, quantity: 1 }] });
    await db.collection('vouchers').insertOne({ code: voucherCode, type: 'PERCENT', value: 100,
      minimumSubtotal: 0, status: 'ACTIVE', usageLimit: 10, usedCount: 0,
      validFrom: new Date(Date.now() - 60_000), validTo: new Date(Date.now() + 600_000) });
    const rejectedQuote = await body(await owner('/checkout/quote', { method: 'POST',
      body: JSON.stringify({ addressId: String(addressId), voucherCode }) }), 400);
    expect(rejectedQuote.code).toBe('ZERO_PAYABLE_NOT_SUPPORTED');
    expect(await db.collection('checkout_quotes').countDocuments({ customerId })).toBe(0);
    const quoteId = randomUUID();
    await db.collection('checkout_quotes').insertOne({ quoteId, customerId, addressId, voucherCode,
      cartFingerprint: `${variantId}:1`, cartItems: [{ variantId, quantity: 1 }], subtotal: 1_000_000,
      shippingFee: 0, voucherDiscount: 1_000_000, payableTotal: 0, expiresAt: new Date(Date.now() + 600_000) });
    const rejectedOrder = await body(await owner('/orders', { method: 'POST',
      headers: { 'Idempotency-Key': randomUUID() }, body: JSON.stringify({ quoteId }) }), 400);
    expect(rejectedOrder.code).toBe('ZERO_PAYABLE_NOT_SUPPORTED');
    expect(await db.collection('orders').countDocuments({ customerId, 'money.payableTotal': 0 })).toBe(0);
    expect((await db.collection('product_variants').findOne({ _id: variantId }))?.reserved).toBe(0);
    expect((await db.collection('vouchers').findOne({ code: voucherCode }))?.usedCount).toBe(0);
    expect((await db.collection('carts').findOne({ customerId }))?.items).toHaveLength(1);
    expect((await db.collection('checkout_quotes').findOne({ quoteId }))?.consumedAt).toBeUndefined();
    const legacyOrder = await seedOrder(db, customer.id, { payableTotal: 0 });
    const rejectedAttempt = await body(await owner('/payments/attempts', { method: 'POST',
      headers: { 'Idempotency-Key': randomUUID() }, body: JSON.stringify({ orderId: legacyOrder.id }) }), 400);
    expect(rejectedAttempt.code).toBe('ZERO_PAYABLE_NOT_SUPPORTED');
    expect(await db.collection('payment_attempts').countDocuments({ orderId: new Types.ObjectId(legacyOrder.id) })).toBe(0);
  });
});
