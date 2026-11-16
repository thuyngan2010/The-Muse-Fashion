import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Types, type Connection } from 'mongoose';
import {
  WEB_ORIGIN, authed, connectDb, grant, inboundTransfer, login, seedOrder, seedPaymentAttempt, seedUser,
  sendWebhook, startApi, uniqueDbName, type RunningApi,
} from './harness.js';

let api: RunningApi;
let db: Connection;

beforeAll(async () => {
  const dbName = uniqueDbName('fc_e2e');
  db = await connectDb(dbName);
  api = await startApi(dbName);
});

afterAll(async () => {
  await api?.stop();
  await db?.dropDatabase();
  await db?.close();
});

describe('RBAC and ownership', () => {
  it('rejects non-finite pagination values before listing orders or payments', async () => {
    const customer = await seedUser(db, 'CUSTOMER', 'pagination');
    const { accessToken } = await login(api, customer.email);
    expect((await authed(api, accessToken)('/orders?page=Infinity')).status).toBe(400);
    expect((await authed(api, accessToken)('/payments?limit=Infinity')).status).toBe(400);
    expect((await fetch(`${api.baseUrl}/products?page=Infinity`)).status).toBe(400);
    expect((await fetch(`${api.baseUrl}/community/posts?limit=Infinity`)).status).toBe(400);
  });

  it('hides another customer order (UC17)', async () => {
    const owner = await seedUser(db, 'CUSTOMER', 'owner');
    const other = await seedUser(db, 'CUSTOMER', 'other');
    const order = await seedOrder(db, owner.id);
    const { accessToken } = await login(api, other.email);

    const response = await authed(api, accessToken)(`/orders/${order.id}`);
    expect(response.status).toBe(404);
  });

  it('rejects staff without order.read on the admin order list', async () => {
    const staff = await seedUser(db, 'STAFF', 'noperm');
    const { accessToken } = await login(api, staff.email);

    const response = await authed(api, accessToken)('/admin/orders');
    expect(response.status).toBe(403);
  });

  it('limits ASSIGNED payment.read staff to payments of assigned orders (UC28)', async () => {
    const customer = await seedUser(db, 'CUSTOMER', 'payer');
    const staff = await seedUser(db, 'STAFF', 'assigned');
    await grant(db, staff.id, 'payment.read', 'ASSIGNED');
    const assigned = await seedOrder(db, customer.id, { assignedStaffId: staff.id });
    const foreign = await seedOrder(db, customer.id);
    const mine = await seedPaymentAttempt(db, assigned.id);
    const notMine = await seedPaymentAttempt(db, foreign.id);
    const { accessToken } = await login(api, staff.email);

    const response = await authed(api, accessToken)('/payments?limit=50');
    expect(response.status).toBe(200);
    const ids = ((await response.json()) as { items: Array<{ id: string }> }).items.map((item) => item.id);
    expect(ids).toContain(mine.id);
    expect(ids).not.toContain(notMine.id);
  });

  it('checks staff cancel permission before replaying an already cancelled order (UC17)', async () => {
    const customer = await seedUser(db, 'CUSTOMER', 'cancelled');
    const staff = await seedUser(db, 'STAFF', 'nocancel');
    const order = await seedOrder(db, customer.id, { state: 'CANCELLED' });
    const { accessToken } = await login(api, staff.email);

    const response = await authed(api, accessToken)(`/orders/${order.id}/cancel`, {
      method: 'POST', headers: { 'Idempotency-Key': randomUUID() }, body: JSON.stringify({ reason: 'probe' }),
    });
    expect(response.status).toBe(403);
  });
});

describe('Session revocation (UC03)', () => {
  it('logout revokes only the current session', async () => {
    const user = await seedUser(db, 'CUSTOMER', 'sessions');
    const first = await login(api, user.email);
    const second = await login(api, user.email);

    const logout = await fetch(`${api.baseUrl}/auth/logout`, {
      method: 'POST', headers: { Cookie: first.refreshCookie, Origin: WEB_ORIGIN },
    });
    expect(logout.status).toBe(204);

    expect((await authed(api, first.accessToken)('/auth/me')).status).toBe(401);
    expect((await authed(api, second.accessToken)('/auth/me')).status).toBe(200);
  });
});

describe('GPM Pay webhook (UC27)', () => {
  it('does not accept SePay webhooks when GPM Pay is selected', async () => {
    const response = await fetch(`${api.baseUrl}/webhooks/payment/sepay`, { method: 'POST' });
    expect(response.status).toBe(404);
  });

  it('rejects an invalid signature', async () => {
    const response = await sendWebhook(api, inboundTransfer('FCDEADBEEF', 1000), 'wrong-secret');
    expect(response.status).toBe(401);
  });

  it('confirms the order once and treats provider retries as duplicates', async () => {
    const customer = await seedUser(db, 'CUSTOMER', 'webhook');
    const order = await seedOrder(db, customer.id, { payableTotal: 250_000 });
    const attempt = await seedPaymentAttempt(db, order.id, { amount: 250_000 });
    const payload = inboundTransfer(attempt.reconciliationCode, 250_000);

    expect((await sendWebhook(api, payload)).status).toBe(204);
    expect((await sendWebhook(api, payload)).status).toBe(204);

    const orderDoc = await db.collection('orders').findOne({ _id: new Types.ObjectId(order.id) });
    const attemptDoc = await db.collection('payment_attempts').findOne({ _id: new Types.ObjectId(attempt.id) });
    const events = await db.collection('payment_events').find({ eventId: payload.id }).toArray();
    const outbox = await db.collection('outbox_events').countDocuments({ type: 'payment.verified', aggregateId: attempt.id });
    expect(orderDoc?.state).toBe('CONFIRMED');
    expect(attemptDoc?.state).toBe('SUCCEEDED');
    expect(events.map((event) => event.resolution)).toEqual(['MATCHED']);
    expect(outbox).toBe(1);
  });

  it('routes payments after the deadline to manual review', async () => {
    const customer = await seedUser(db, 'CUSTOMER', 'late');
    const order = await seedOrder(db, customer.id, { paymentDueAt: new Date(Date.now() - 60_000) });
    const attempt = await seedPaymentAttempt(db, order.id, { expiresAt: new Date(Date.now() - 60_000) });
    const payload = inboundTransfer(attempt.reconciliationCode, 100_000);

    expect((await sendWebhook(api, payload)).status).toBe(204);

    const orderDoc = await db.collection('orders').findOne({ _id: new Types.ObjectId(order.id) });
    const event = await db.collection('payment_events').findOne({ eventId: payload.id });
    expect(orderDoc?.state).not.toBe('CONFIRMED');
    expect(event?.resolution).toBe('REQUIRES_REVIEW');
  });
});
