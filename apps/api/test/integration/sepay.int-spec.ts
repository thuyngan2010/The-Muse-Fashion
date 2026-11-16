import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Types, type Connection } from 'mongoose';
import { authed, connectDb, login, seedOrder, seedPaymentAttempt, seedUser, startApi, uniqueDbName, type RunningApi } from './harness.js';

let api: RunningApi;
let db: Connection;
const accountNumber = '0123456789';
const apiKey = 'integration-sepay-webhook-key';

beforeAll(async () => {
  const dbName = uniqueDbName('fc_sepay');
  db = await connectDb(dbName);
  api = await startApi(dbName, { PAYMENT_PROVIDER: 'SEPAY' });
});

afterAll(async () => {
  await api?.stop();
  await db?.dropDatabase();
  await db?.close();
});

function webhook(payload: Record<string, unknown>, key = apiKey) {
  return fetch(`${api.baseUrl}/webhooks/payment/sepay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Apikey ${key}` },
    body: JSON.stringify(payload),
  });
}

function transfer(code: string, amount: number, type: 'in' | 'out' = 'in') {
  return {
    id: Math.floor(Math.random() * 1_000_000_000) + 1,
    gateway: 'MB', transactionDate: '2026-10-25 11:08:33', accountNumber,
    content: `Thanh toan ${code}`, transferType: type, transferAmount: amount,
    referenceCode: randomUUID(),
  };
}

describe('SePay bank transfer', () => {
  it('creates a SePay QR and confirms an inbound transfer exactly once', async () => {
    const customer = await seedUser(db, 'CUSTOMER', 'sepay-owner');
    const order = await seedOrder(db, customer.id, { payableTotal: 250_000 });
    const { accessToken } = await login(api, customer.email);
    const idempotencyKey = randomUUID();
    const create = await authed(api, accessToken)('/payments/attempts', {
      method: 'POST', headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ orderId: order.id }),
    });
    expect(create.status).toBe(201);
    const attempt = await create.json() as { id: string; provider: string; reconciliationCode: string; qrImageUrl: string };
    expect(attempt.provider).toBe('SEPAY');
    const qr = new URL(attempt.qrImageUrl);
    expect(qr.origin).toBe('https://vietqr.app');
    expect(qr.searchParams.get('acc')).toBe(accountNumber);
    expect(qr.searchParams.get('amount')).toBe('250000');
    expect(qr.searchParams.get('des')).toBe(attempt.reconciliationCode);
    const clientProviderOverride = await authed(api, accessToken)('/payments/attempts', {
      method: 'POST', headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ orderId: order.id, provider: 'GPMPAY' }),
    });
    expect(clientProviderOverride.status).toBe(400);
    const inactiveWebhook = await fetch(`${api.baseUrl}/webhooks/payment/gpmpay`, { method: 'POST' });
    expect(inactiveWebhook.status).toBe(404);

    const payload = transfer(attempt.reconciliationCode, 250_000);
    const invalid = await webhook(payload, 'wrong-key');
    expect(invalid.status).toBe(401);
    const first = await webhook(payload);
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ success: true });
    const duplicate = await webhook(payload);
    expect(duplicate.status).toBe(200);
    expect(await duplicate.json()).toEqual({ success: true });

    expect((await db.collection('orders').findOne({ _id: new Types.ObjectId(order.id) }))?.state).toBe('CONFIRMED');
    expect((await db.collection('payment_attempts').findOne({ _id: new Types.ObjectId(attempt.id) }))?.state).toBe('SUCCEEDED');
    expect(await db.collection('payment_events').countDocuments({ provider: 'SEPAY', eventId: String(payload.id) })).toBe(1);
    const event = await db.collection('payment_events').findOne({ provider: 'SEPAY', eventId: String(payload.id) });
    expect(event).toMatchObject({ authenticationMethod: 'API_KEY', signatureVerified: false, resolution: 'MATCHED' });
    expect(await db.collection('outbox_events').countDocuments({ type: 'payment.verified', aggregateId: attempt.id })).toBe(1);
  });

  it('rejects malformed payloads and sends unmatched or outbound transfers to review', async () => {
    expect((await webhook({ id: 1, transferAmount: '100' })).status).toBe(400);
    const unmatched = transfer('FCZZZZZZZZ', 100_000);
    expect((await webhook(unmatched)).status).toBe(200);
    expect((await db.collection('payment_events').findOne({ provider: 'SEPAY', eventId: String(unmatched.id) }))?.resolution).toBe('UNMATCHED');
    const outbound = transfer('RFZZZZZZZZ', 100_000, 'out');
    expect((await webhook(outbound)).status).toBe(200);
    expect((await db.collection('payment_events').findOne({ provider: 'SEPAY', eventId: String(outbound.id) }))?.resolution).toBe('REQUIRES_REVIEW');
    expect((await webhook({ test: true })).status).toBe(200);
  });

  it('does not apply a SePay webhook to a GPM Pay attempt or accept the wrong amount', async () => {
    const customer = await seedUser(db, 'CUSTOMER', 'sepay-isolation');
    const gpmOrder = await seedOrder(db, customer.id);
    const gpmAttempt = await seedPaymentAttempt(db, gpmOrder.id);
    const wrongProvider = transfer(gpmAttempt.reconciliationCode, 100_000);
    expect((await webhook(wrongProvider)).status).toBe(200);
    expect((await db.collection('orders').findOne({ _id: new Types.ObjectId(gpmOrder.id) }))?.state).toBe('PENDING_PAYMENT');
    expect((await db.collection('payment_events').findOne({ provider: 'SEPAY', eventId: String(wrongProvider.id) }))?.resolution)
      .toBe('UNMATCHED');

    const sepayOrder = await seedOrder(db, customer.id);
    const sepayAttempt = await seedPaymentAttempt(db, sepayOrder.id, { provider: 'SEPAY' });
    const wrongAmount = transfer(sepayAttempt.reconciliationCode, 99_999);
    expect((await webhook(wrongAmount)).status).toBe(200);
    expect((await db.collection('orders').findOne({ _id: new Types.ObjectId(sepayOrder.id) }))?.state).toBe('PENDING_PAYMENT');
    expect((await db.collection('payment_events').findOne({ provider: 'SEPAY', eventId: String(wrongAmount.id) }))?.resolution)
      .toBe('REQUIRES_REVIEW');
  });
});
