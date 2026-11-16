import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { Types, type Connection } from 'mongoose';
import { authed, connectDb, login, seedUser, startApi, uniqueDbName, type RunningApi } from './harness.js';

let db: Connection;
let api: RunningApi;

beforeAll(async () => {
  const name = uniqueDbName('fc_checkout_voucher');
  db = await connectDb(name);
  api = await startApi(name);
});

afterAll(async () => {
  await api?.stop();
  await db?.dropDatabase();
  await db?.close();
});

it('creates an undiscounted order from a fresh quote after rejecting a replacement voucher', async () => {
  const customer = await seedUser(db, 'CUSTOMER', 'vouchercheckout');
  const request = authed(api, (await login(api, customer.email)).accessToken);
  const customerId = new Types.ObjectId(customer.id);
  const addressId = new Types.ObjectId();
  const productId = new Types.ObjectId();
  const variantId = new Types.ObjectId();
  const now = new Date();
  await db.collection('addresses').insertOne({ _id: addressId, customerId, receiver: 'QA Customer',
    phone: '0901234567', location: { line1: '1 Test', ward: '1', district: '1', province: 'HCM' } });
  await db.collection('products').insertOne({ _id: productId, slug: randomUUID(), name: 'QA T-shirt',
    price: 290_000, currency: 'VND', status: 'PUBLISHED' });
  await db.collection('product_variants').insertOne({ _id: variantId, productId, sku: randomUUID(),
    price: 290_000, stockOnHand: 10, reserved: 0, version: 1, status: 'ACTIVE' });
  await db.collection('carts').insertOne({ customerId, items: [{ variantId, quantity: 2 }] });
  await db.collection('vouchers').insertOne({ code: 'QAVALID', type: 'FIXED', value: 50_000,
    minimumSubtotal: 0, status: 'ACTIVE', usageLimit: 10, usedCount: 0,
    validFrom: new Date(now.getTime() - 60_000), validTo: new Date(now.getTime() + 600_000) });
  const quote = (voucherCode?: string) => request('/checkout/quote', {
    method: 'POST', body: JSON.stringify({ addressId: String(addressId), voucherCode }),
  });
  const discounted = await quote('QAVALID');
  expect(discounted.status).toBe(201);
  expect((await discounted.json()).payableTotal).toBe(560_000);
  const rejected = await quote('INVALIDVOUCHER99');
  expect(rejected.status).toBe(400);
  expect((await rejected.json()).code).toBe('VOUCHER_INVALID');
  const fallback = await quote();
  expect(fallback.status).toBe(201);
  const fresh = await fallback.json() as { id: string; payableTotal: number; voucherDiscount: number };
  expect(fresh.payableTotal).toBe(610_000);
  expect(fresh.voucherDiscount).toBe(0);
  const created = await request('/orders', { method: 'POST', headers: { 'Idempotency-Key': randomUUID() },
    body: JSON.stringify({ quoteId: fresh.id }) });
  expect(created.status).toBe(201);
  const order = await created.json() as { id: string; money: { payableTotal: number } };
  expect(order.money.payableTotal).toBe(610_000);
  expect((await db.collection('orders').findOne({ _id: new Types.ObjectId(order.id) }))?.voucherCode).toBeUndefined();
  expect((await db.collection('vouchers').findOne({ code: 'QAVALID' }))?.usedCount).toBe(0);
  expect((await db.collection('product_variants').findOne({ _id: variantId }))?.reserved).toBe(2);
});
