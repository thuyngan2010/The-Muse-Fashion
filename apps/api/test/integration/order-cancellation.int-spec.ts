import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Types, type Connection } from 'mongoose';
import {
  authed, connectDb, inboundTransfer, login, seedOrder, seedPaymentAttempt, seedUser,
  sendWebhook, startApi, uniqueDbName, type RunningApi,
} from './harness.js';

let api: RunningApi;
let db: Connection;
let customerId: string;
let adminId: string;
let request: ReturnType<typeof authed>;

beforeAll(async () => {
  const dbName = uniqueDbName('fc_order_cancel');
  db = await connectDb(dbName);
  api = await startApi(dbName);
  customerId = (await seedUser(db, 'CUSTOMER', 'cancelcustomer')).id;
  const admin = await seedUser(db, 'ADMIN', 'canceladmin');
  adminId = admin.id;
  request = authed(api, (await login(api, admin.email)).accessToken);
});

afterAll(async () => {
  await api?.stop();
  await db?.dropDatabase();
  await db?.close();
});

async function reservedOrder() {
  const order = await seedOrder(db, customerId);
  const variantId = new Types.ObjectId();
  const voucherCode = `CANCEL${randomUUID()}`;
  await db.collection('product_variants').insertOne({
    _id: variantId, productId: new Types.ObjectId(), sku: randomUUID(),
    stockOnHand: 8, reserved: 2, version: 1, status: 'ACTIVE', price: 50_000,
  });
  await db.collection('vouchers').insertOne({ code: voucherCode.toUpperCase(), usedCount: 1 });
  await db.collection('orders').updateOne({ _id: new Types.ObjectId(order.id) }, { $set: {
    voucherCode,
    items: [{ lineId: String(new Types.ObjectId()), variantId: String(variantId), quantity: 2,
      productId: String(new Types.ObjectId()), sku: 'TEST', productName: 'Test',
      unitPrice: 50_000, discount: 0, lineTotal: 100_000 }],
  } });
  return { ...order, variantId, voucherCode };
}

async function cancel(orderId: string, key = randomUUID()) {
  return request(`/orders/${orderId}/cancel`, {
    method: 'POST', headers: { 'Idempotency-Key': key },
    body: JSON.stringify({ reason: 'Cancellation regression test' }),
  });
}

describe('Order cancellation and payment history', () => {
  it('refunds the succeeded retry and releases stock/voucher exactly once', async () => {
    const order = await reservedOrder();
    const failed = await seedPaymentAttempt(db, order.id, { state: 'FAILED' });
    const paid = await seedPaymentAttempt(db, order.id);
    expect((await sendWebhook(api, inboundTransfer(paid.reconciliationCode, 100_000))).status).toBe(204);

    const key = randomUUID();
    const response = await cancel(order.id, key);
    expect(response.status).toBe(201);
    expect((await response.json()).state).toBe('CANCEL_PENDING_REFUND');
    expect((await cancel(order.id, key)).status).toBe(201);

    const refunds = await db.collection('refunds').find({ orderId: new Types.ObjectId(order.id) }).toArray();
    expect(refunds).toHaveLength(1);
    expect(String(refunds[0].paymentAttemptId)).toBe(paid.id);
    expect(refunds[0]).toMatchObject({ amount: 100_000, state: 'PENDING_APPROVAL' });
    expect((await db.collection('payment_attempts').findOne({ _id: new Types.ObjectId(failed.id) }))?.state).toBe('FAILED');
    expect((await db.collection('payment_attempts').findOne({ _id: new Types.ObjectId(paid.id) }))?.state).toBe('SUCCEEDED');
    expect((await db.collection('product_variants').findOne({ _id: order.variantId }))?.reserved).toBe(0);
    expect((await db.collection('product_variants').findOne({ _id: order.variantId }))?.stockOnHand).toBe(8);
    expect((await db.collection('vouchers').findOne({ code: order.voucherCode.toUpperCase() }))?.usedCount).toBe(0);
    expect(await db.collection('inventory_ledger').countDocuments({ orderId: new Types.ObjectId(order.id), type: 'RELEASE' })).toBe(1);
  });

  it('invalidates a pending retry even when an older attempt failed', async () => {
    const order = await reservedOrder();
    await seedPaymentAttempt(db, order.id, { state: 'FAILED' });
    await seedPaymentAttempt(db, order.id);
    const response = await cancel(order.id);
    expect(response.status).toBe(201);
    expect((await response.json()).state).toBe('CANCELLED');
    expect(await db.collection('payment_attempts').countDocuments({ orderId: new Types.ObjectId(order.id), state: 'PENDING' })).toBe(0);
    expect(await db.collection('refunds').countDocuments({ orderId: new Types.ObjectId(order.id) })).toBe(0);
    expect((await db.collection('product_variants').findOne({ _id: order.variantId }))?.reserved).toBe(0);
    expect((await db.collection('vouchers').findOne({ code: order.voucherCode.toUpperCase() }))?.usedCount).toBe(0);
  });

  it.each([40_000, 100_000])('honors %i already refunded on a succeeded retry', async (refunded) => {
    const order = await reservedOrder();
    await seedPaymentAttempt(db, order.id, { state: 'FAILED' });
    const paid = await seedPaymentAttempt(db, order.id, { state: 'SUCCEEDED' });
    await db.collection('orders').updateOne({ _id: new Types.ObjectId(order.id) }, { $set: { state: 'CONFIRMED' } });
    await db.collection('refunds').insertOne({
      orderId: new Types.ObjectId(order.id), paymentAttemptId: new Types.ObjectId(paid.id),
      amount: refunded, state: 'SUCCEEDED', reason: 'Prior refund',
      proposedBy: new Types.ObjectId(adminId), idempotencyKey: randomUUID(),
    });
    const response = await cancel(order.id);
    expect(response.status).toBe(201);
    expect((await response.json()).state).toBe(refunded === 100_000 ? 'CANCELLED' : 'CANCEL_PENDING_REFUND');
    const proposed = await db.collection('refunds').find({ orderId: new Types.ObjectId(order.id), state: 'PENDING_APPROVAL' }).toArray();
    expect(proposed.map((r) => r.amount)).toEqual(refunded === 100_000 ? [] : [60_000]);
  });

  it('recognizes a succeeded retry when confirming through the status endpoint', async () => {
    const order = await seedOrder(db, customerId);
    await seedPaymentAttempt(db, order.id, { state: 'FAILED' });
    await seedPaymentAttempt(db, order.id, { state: 'SUCCEEDED' });
    const response = await request(`/admin/orders/${order.id}/status`, {
      method: 'PATCH', body: JSON.stringify({ state: 'CONFIRMED', reason: 'Confirm paid retry', expectedVersion: 1 }),
    });
    expect(response.status).toBe(200);
    expect((await response.json()).state).toBe('CONFIRMED');
  });

  it.each([
    ['PENDING_PAYMENT', 'CANCELLED'],
    ['CONFIRMED', 'CANCEL_PENDING_REFUND'],
    ['PREPARING', 'CANCEL_PENDING_REFUND'],
    ['CANCEL_PENDING_REFUND', 'CANCELLED'],
  ])('rejects %s -> %s through the status endpoint without side effects', async (from, to) => {
    const order = await reservedOrder();
    await db.collection('orders').updateOne({ _id: new Types.ObjectId(order.id) }, { $set: { state: from } });
    const response = await request(`/admin/orders/${order.id}/status`, {
      method: 'PATCH', body: JSON.stringify({ state: to, reason: 'Attempt cancellation bypass' }),
    });
    expect(response.status).toBe(400);
    expect((await db.collection('orders').findOne({ _id: new Types.ObjectId(order.id) }))?.state).toBe(from);
    expect((await db.collection('product_variants').findOne({ _id: order.variantId }))?.reserved).toBe(2);
    expect((await db.collection('vouchers').findOne({ code: order.voucherCode.toUpperCase() }))?.usedCount).toBe(1);
    expect(await db.collection('refunds').countDocuments({ orderId: new Types.ObjectId(order.id) })).toBe(0);
    expect(await db.collection('order_events').countDocuments({ orderId: new Types.ObjectId(order.id) })).toBe(0);
  });
});
