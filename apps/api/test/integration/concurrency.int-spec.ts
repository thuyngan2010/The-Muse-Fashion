import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Types, type Connection } from 'mongoose';
import {
  authed, connectDb, dbUri, inboundTransfer, login, seedOrder, seedPaymentAttempt, seedUser,
  sendWebhook, startApi, uniqueDbName, type RunningApi,
} from './harness.js';

let api: RunningApi;
let db: Connection;
let dbName: string;

beforeAll(async () => {
  dbName = uniqueDbName('fc_races');
  db = await connectDb(dbName);
  api = await startApi(dbName);
});

afterAll(async () => {
  await api?.stop();
  await db?.dropDatabase();
  await db?.close();
});

async function responseDetails(response: Response) {
  return { status: response.status, body: await response.json().catch(() => null) as Record<string, unknown> | null };
}

describe('database concurrency', () => {
  it('allows only five of twenty simultaneous checkouts for five units and five voucher uses', async () => {
    const productId = new Types.ObjectId();
    const variantId = new Types.ObjectId();
    const now = new Date();
    await db.collection('products').insertOne({
      _id: productId, slug: `race-${randomUUID()}`, name: 'Concurrent checkout item', price: 100_000,
      currency: 'VND', status: 'PUBLISHED', createdAt: now, updatedAt: now,
    });
    await db.collection('product_variants').insertOne({
      _id: variantId, productId, sku: `RACE-${randomUUID()}`, price: 100_000,
      stockOnHand: 5, reserved: 0, status: 'ACTIVE', version: 1, createdAt: now, updatedAt: now,
    });
    await db.collection('vouchers').insertOne({
      code: 'RACE5', type: 'FIXED', value: 1_000, minimumSubtotal: 0,
      validFrom: new Date(now.getTime() - 60_000), validTo: new Date(now.getTime() + 60 * 60_000),
      usageLimit: 5, usedCount: 0, status: 'ACTIVE', createdAt: now, updatedAt: now,
    });

    const users = await Promise.all(Array.from({ length: 20 }, (_, index) => seedUser(db, 'CUSTOMER', `checkout${index}`)));
    const addresses = users.map((user) => ({
      _id: new Types.ObjectId(), customerId: new Types.ObjectId(user.id), receiver: 'Race Customer',
      phone: '0901234567', location: { line1: '1 Test Street', ward: 'Ward 1', district: 'District 1', province: 'HCM' },
      isDefault: true, createdAt: now, updatedAt: now,
    }));
    await db.collection('addresses').insertMany(addresses);
    await db.collection('carts').insertMany(users.map((user) => ({
      customerId: new Types.ObjectId(user.id), items: [{ variantId, quantity: 1 }], createdAt: now, updatedAt: now,
    })));
    const tokens = await Promise.all(users.map(async (user) => (await login(api, user.email)).accessToken));
    const quoteResults = await Promise.all(tokens.map((token, index) => authed(api, token)('/checkout/quote', {
      method: 'POST', body: JSON.stringify({ addressId: String(addresses[index]!._id), voucherCode: 'RACE5' }),
    }).then(responseDetails)));
    expect(quoteResults.map((result) => result.status)).toEqual(Array(20).fill(201));
    const quoteIds = quoteResults.map((result) => String(result.body?.id));

    const results = await Promise.all(tokens.map((token, index) => authed(api, token)('/orders', {
      method: 'POST', headers: { 'Idempotency-Key': randomUUID() },
      body: JSON.stringify({ quoteId: quoteIds[index] }),
    }).then(responseDetails)));
    expect(results.filter((result) => result.status === 201)).toHaveLength(5);
    const rejected = results.filter((result) => result.status !== 201);
    expect(rejected, JSON.stringify(rejected)).toHaveLength(15);
    expect(rejected.every((result) => result.status === 409 || (result.status === 400 && result.body?.message === 'Voucher usage limit reached'))).toBe(true);

    const variant = await db.collection('product_variants').findOne({ _id: variantId });
    const voucher = await db.collection('vouchers').findOne({ code: 'RACE5' });
    expect(variant?.stockOnHand).toBe(5);
    expect(variant?.reserved).toBe(5);
    expect(voucher?.usedCount).toBe(5);
    expect(await db.collection('orders').countDocuments({ state: 'PENDING_PAYMENT' })).toBe(5);
    expect(await db.collection('inventory_ledger').countDocuments({ variantId, type: 'RESERVE' })).toBe(5);
    expect(await db.collection('checkout_quotes').countDocuments({ consumedAt: { $exists: true } })).toBe(5);
  });

  it('replays one order for twenty simultaneous requests with the same idempotency key', async () => {
    const productId = new Types.ObjectId();
    const variantId = new Types.ObjectId();
    const addressId = new Types.ObjectId();
    const now = new Date();
    const customer = await seedUser(db, 'CUSTOMER', 'replaycheckout');
    await db.collection('products').insertOne({
      _id: productId, slug: `replay-${randomUUID()}`, name: 'Idempotent checkout item',
      price: 100_000, currency: 'VND', status: 'PUBLISHED', createdAt: now, updatedAt: now,
    });
    await db.collection('product_variants').insertOne({
      _id: variantId, productId, sku: `REPLAY-${randomUUID()}`, price: 100_000,
      stockOnHand: 20, reserved: 0, status: 'ACTIVE', version: 1, createdAt: now, updatedAt: now,
    });
    await db.collection('addresses').insertOne({
      _id: addressId, customerId: new Types.ObjectId(customer.id), receiver: 'Replay Customer',
      phone: '0901234567', location: { line1: '1 Test Street', ward: 'Ward 1', district: 'District 1', province: 'HCM' },
      isDefault: true, createdAt: now, updatedAt: now,
    });
    await db.collection('carts').insertOne({
      customerId: new Types.ObjectId(customer.id), items: [{ variantId, quantity: 1 }], createdAt: now, updatedAt: now,
    });
    const { accessToken } = await login(api, customer.email);
    const request = authed(api, accessToken);
    const quoteResponse = await request('/checkout/quote', {
      method: 'POST', body: JSON.stringify({ addressId: String(addressId) }),
    });
    expect(quoteResponse.status).toBe(201);
    const { id: quoteId } = await quoteResponse.json() as { id: string };
    const key = randomUUID();
    const results = await Promise.all(Array.from({ length: 20 }, () => request('/orders', {
      method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify({ quoteId }),
    }).then(responseDetails)));
    expect(results.map((result) => result.status)).toEqual(Array(20).fill(201));
    expect(new Set(results.map((result) => result.body?.id)).size).toBe(1);
    expect(await db.collection('orders').countDocuments({ customerId: new Types.ObjectId(customer.id) })).toBe(1);
    expect((await db.collection('product_variants').findOne({ _id: variantId }))?.reserved).toBe(1);
    expect(await db.collection('inventory_ledger').countDocuments({ variantId, type: 'RESERVE' })).toBe(1);
  });

  it('never leaves a pending attempt on an order cancelled while an attempt is created', async () => {
    const customer = await seedUser(db, 'CUSTOMER', 'paymentcancel');
    const { accessToken } = await login(api, customer.email);
    const request = authed(api, accessToken);
    for (let iteration = 0; iteration < 10; iteration += 1) {
      const order = await seedOrder(db, customer.id);
      const [attempt, cancel] = await Promise.all([
        request('/payments/attempts', {
          method: 'POST', headers: { 'Idempotency-Key': randomUUID() }, body: JSON.stringify({ orderId: order.id }),
        }).then(responseDetails),
        request(`/orders/${order.id}/cancel`, {
          method: 'POST', headers: { 'Idempotency-Key': randomUUID() }, body: JSON.stringify({ reason: 'Changed mind' }),
        }).then(responseDetails),
      ]);
      expect([201, 409, 422]).toContain(attempt.status);
      expect(cancel.status).toBe(201);
      expect((await db.collection('orders').findOne({ _id: new Types.ObjectId(order.id) }))?.state).toBe('CANCELLED');
      expect(await db.collection('payment_attempts').countDocuments({ orderId: new Types.ObjectId(order.id), state: 'PENDING' })).toBe(0);
    }
  });

  it('never leaves a pending attempt when expiry races with attempt creation', async () => {
    const env = {
      NODE_ENV: 'test', MONGODB_URI: dbUri(dbName), JWT_SECRET: randomBytes(32).toString('hex'),
      REFUND_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
      EMAIL_TOKEN_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
    };
    const previous = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
    Object.assign(process.env, env);
    try {
      const [{ NestFactory }, { AppModule }, { OrderService }] = await Promise.all([
        import('@nestjs/core'), import('../../dist/app.module.js'), import('../../dist/modules/commerce/order.service.js'),
      ]);
      const context = await NestFactory.createApplicationContext(AppModule, { logger: false });
      try {
        const orders = context.get(OrderService);
        const customer = await seedUser(db, 'CUSTOMER', 'paymentexpiry');
        const { accessToken } = await login(api, customer.email);
        const request = authed(api, accessToken);
        for (let iteration = 0; iteration < 10; iteration += 1) {
          const order = await seedOrder(db, customer.id);
          const [attempt] = await Promise.all([
            request('/payments/attempts', {
              method: 'POST', headers: { 'Idempotency-Key': randomUUID() }, body: JSON.stringify({ orderId: order.id }),
            }).then(responseDetails),
            orders.expireOrder(order.id),
          ]);
          expect([201, 409]).toContain(attempt.status);
          expect((await db.collection('orders').findOne({ _id: new Types.ObjectId(order.id) }))?.state).toBe('CANCELLED');
          expect(await db.collection('payment_attempts').countDocuments({ orderId: new Types.ObjectId(order.id), state: 'PENDING' })).toBe(0);
        }
      } finally {
        await context.close();
      }
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it('records one refund completion when the webhook and manual completion race', async () => {
    // The preceding load cases exhaust the API's 120 requests/minute per-IP test bucket.
    await api.stop();
    api = await startApi(dbName);
    const customer = await seedUser(db, 'CUSTOMER', 'refundcustomer');
    const proposer = await seedUser(db, 'ADMIN', 'refundproposer');
    const reviewer = await seedUser(db, 'ADMIN', 'refundreviewer');
    const { accessToken } = await login(api, reviewer.email);
    const request = authed(api, accessToken);
    for (let iteration = 0; iteration < 5; iteration += 1) {
      const order = await seedOrder(db, customer.id, { state: 'CANCEL_PENDING_REFUND' });
      const attempt = await seedPaymentAttempt(db, order.id, { state: 'SUCCEEDED' });
      const refundId = new Types.ObjectId();
      const evidenceKey = `refund_evidence/${reviewer.id}/${randomUUID()}.png`;
      const reconciliationCode = `RF${randomUUID().replaceAll('-', '').slice(0, 14).toUpperCase()}`;
      const approvedAt = new Date(Date.now() - 60_000);
      await db.collection('media_objects').insertOne({
        ownerId: new Types.ObjectId(reviewer.id), key: evidenceKey, purpose: 'refund_evidence',
        visibility: 'PRIVATE', status: 'READY', createdAt: approvedAt, updatedAt: approvedAt,
      });
      await db.collection('refunds').insertOne({
        _id: refundId, paymentAttemptId: new Types.ObjectId(attempt.id), orderId: new Types.ObjectId(order.id),
        amount: 100_000, state: 'APPROVED', idempotencyKey: randomUUID(), reason: 'Refund race',
        proposedBy: new Types.ObjectId(proposer.id), approvedBy: new Types.ObjectId(reviewer.id),
        beneficiary: { bankBin: '970422', accountNumber: '1234567890', accountName: 'RACE CUSTOMER' },
        reconciliationCode, transferContent: `Hoan tien ${reconciliationCode}`, approvedAt,
        createdAt: approvedAt, updatedAt: approvedAt,
      });
      const payload = {
        ...inboundTransfer(reconciliationCode, 100_000), transferType: 'out',
        counterAccount: '1234567890', counterBankBin: '970422',
      };
      const [webhook, manual] = await Promise.all([
        sendWebhook(api, payload).then(responseDetails),
        request(`/admin/refunds/${refundId}/complete`, {
          method: 'PATCH', headers: { 'Idempotency-Key': randomUUID() },
          body: JSON.stringify({ bankReference: `MANUAL-${iteration}`, evidenceObjectKey: evidenceKey }),
        }).then(responseDetails),
      ]);
      expect(webhook.status).toBe(204);
      expect([200, 409]).toContain(manual.status);
      expect((await db.collection('refunds').findOne({ _id: refundId }))?.state).toBe('SUCCEEDED');
      expect(await db.collection('outbox_events').countDocuments({ type: 'refund.completed', aggregateId: String(refundId) })).toBe(1);
      expect(await db.collection('audit_logs').countDocuments({ entityType: 'refund', entityId: String(refundId), action: { $in: ['refund.complete.manual', 'refund.webhook.matched'] } })).toBe(1);
      expect(await db.collection('payment_events').countDocuments({ eventId: payload.id })).toBe(1);
    }
  });
});
