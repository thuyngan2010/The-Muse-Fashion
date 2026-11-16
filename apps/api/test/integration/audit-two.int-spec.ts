import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Types, type Connection } from 'mongoose';
import { authed, connectDb, grant, inboundTransfer, login, PASSWORD, seedOrder, seedPaymentAttempt, seedUser, sendWebhook, startApi, uniqueDbName, WEB_ORIGIN, type RunningApi } from './harness.js';

let db: Connection, api: RunningApi;
let adminA: Awaited<ReturnType<typeof seedUser>>, adminB: Awaited<ReturnType<typeof seedUser>>, customer: Awaited<ReturnType<typeof seedUser>>;
let a: ReturnType<typeof authed>, b: ReturnType<typeof authed>, owner: ReturnType<typeof authed>;
beforeAll(async () => {
  const name = uniqueDbName('fc_audit_two'); db = await connectDb(name); api = await startApi(name);
  adminA = await seedUser(db, 'ADMIN', 'audit2-admin-a'); adminB = await seedUser(db, 'ADMIN', 'audit2-admin-b'); customer = await seedUser(db, 'CUSTOMER', 'audit2-customer');
  a = authed(api, (await login(api, adminA.email)).accessToken); b = authed(api, (await login(api, adminB.email)).accessToken); owner = authed(api, (await login(api, customer.email)).accessToken);
});
afterAll(async () => { await api?.stop(); await db?.dropDatabase(); await db?.close(); });
async function proof(userId: string) {
  const key = `refund_evidence/${userId}/${randomUUID()}.png`;
  await db.collection('media_objects').insertOne({ key, ownerId: new Types.ObjectId(userId), purpose: 'refund_evidence', visibility: 'PRIVATE', status: 'READY' }); return key;
}
const patch = (body: unknown) => ({ method: 'PATCH', body: JSON.stringify(body) });

describe('Second audit regressions through HTTP and MongoDB', () => {
  it('READY prepares, transit ships, repeated updates do not duplicate events and backwards updates roll back', async () => {
    const order = await seedOrder(db, customer.id, { state: 'CONFIRMED' }); await seedPaymentAttempt(db, order.id, { state: 'SUCCEEDED' });
    const shipment = { carrier: 'TEST', trackingCode: randomUUID(), status: 'READY' };
    expect((await a(`/admin/orders/${order.id}/shipment`, patch(shipment))).status).toBe(200);
    expect((await (await owner(`/orders/${order.id}`)).json()).state).toBe('PREPARING');
    expect((await a(`/admin/orders/${order.id}/shipment`, patch(shipment))).status).toBe(200);
    expect(await db.collection('order_events').countDocuments({ orderId: new Types.ObjectId(order.id) })).toBe(1);
    expect((await a(`/admin/orders/${order.id}/shipment`, patch({ ...shipment, status: 'IN_TRANSIT' }))).status).toBe(200);
    expect((await (await owner(`/orders/${order.id}`)).json()).state).toBe('SHIPPING');
    expect((await a(`/admin/orders/${order.id}/shipment`, patch(shipment))).status).toBe(422);
    const delivered = { ...shipment, status: 'DELIVERED' };
    expect((await a(`/admin/orders/${order.id}/shipment`, patch(delivered))).status).toBe(200);
    expect((await a(`/admin/orders/${order.id}/shipment`, patch(delivered))).status).toBe(200);
    expect(await db.collection('order_events').countDocuments({ orderId: new Types.ObjectId(order.id), to: 'DELIVERED' })).toBe(1);
    const unprepared = await seedOrder(db, customer.id, { state: 'CONFIRMED' });
    expect((await a(`/admin/orders/${unprepared.id}/shipment`, patch({ ...shipment, status: 'IN_TRANSIT' }))).status).toBe(422);
  });

  it('shows open review for money arriving on an older attempt and suppresses a new payment instruction', async () => {
    const order = await seedOrder(db, customer.id);
    const old = await seedPaymentAttempt(db, order.id, { state: 'FAILED' }); const current = await seedPaymentAttempt(db, order.id);
    expect((await sendWebhook(api, inboundTransfer(old.reconciliationCode, 95000))).status).toBe(204);
    const latest = await (await owner(`/payments/order/${order.id}/latest`)).json();
    expect(latest).toMatchObject({ id: current.id, state: 'PENDING', hasOpenReview: true, canRetry: false }); expect(latest).not.toHaveProperty('qrImageUrl');
    const recreated = await owner('/payments/attempts', { method: 'POST', headers: { 'idempotency-key': randomUUID() }, body: JSON.stringify({ orderId: order.id }) });
    expect(recreated.status).toBe(201); expect((await recreated.json()).hasOpenReview).toBe(true);
    expect(await db.collection('payment_attempts').countDocuments({ orderId: new Types.ObjectId(order.id) })).toBe(2);
  });

  it('requires two admins, exact amount and separate private evidence to record a late-money return without reviving the order', async () => {
    const order = await seedOrder(db, customer.id, { state: 'CANCELLED' }); const attempt = await seedPaymentAttempt(db, order.id, { state: 'FAILED' });
    const incoming = inboundTransfer(attempt.reconciliationCode, 120000); await sendWebhook(api, incoming);
    const event = await db.collection('payment_events').findOne({ eventId: incoming.id }); const path = `/admin/payment-events/${event!._id}/review`;
    const evidenceA = await proof(adminA.id), evidenceB = await proof(adminB.id);
    expect((await a(path, patch({ decision: 'CLOSED_NO_ACTION', note: 'Cannot silently close received funds', evidenceObjectKey: evidenceA }))).status).toBe(422);
    const proposal = { decision: 'REFUNDED_EXTERNALLY', note: 'Receipt verified; full incoming amount returned outside this application', evidenceObjectKey: evidenceA, amount: 120000, bankReference: 'AUDIT2-' + randomUUID() };
    expect((await a(path, patch({ ...proposal, amount: 100000 }))).status).toBe(422);
    const proposed = await a(path, patch(proposal)); expect(proposed.status).toBe(200); expect((await proposed.json()).resolution).toBe('PENDING_APPROVAL');
    expect((await a(path, patch(proposal))).status).toBe(200);
    const approve = { decision: 'APPROVE', note: 'Independent comparison of bank statement and return receipt', evidenceObjectKey: evidenceB };
    expect((await a(path, patch({ ...approve, evidenceObjectKey: evidenceA }))).status).toBe(403);
    expect((await b(path, patch({ ...approve, evidenceObjectKey: evidenceA }))).status).toBe(422);
    const approved = await b(path, patch(approve)); expect(approved.status).toBe(200); expect((await approved.json()).resolution).toBe('REFUNDED_EXTERNALLY');
    expect((await b(path, patch(approve))).status).toBe(200);
    const payment = await (await owner(`/payments/${attempt.id}`)).json(); expect(payment).toMatchObject({ state: 'FAILED', hasOpenReview: false, reviewOutcome: 'REFUNDED_EXTERNALLY' });
    expect((await db.collection('orders').findOne({ _id: new Types.ObjectId(order.id) }))?.state).toBe('CANCELLED');
    const resolved = await (await a('/admin/payment-events?view=RESOLVED')).json(); expect(resolved.items.some((row: { id: string }) => row.id === String(event!._id))).toBe(true);
    const another = inboundTransfer(attempt.reconciliationCode, 120000); await sendWebhook(api, another);
    const nextEvent = await db.collection('payment_events').findOne({ eventId: another.id }); const nextPath = `/admin/payment-events/${nextEvent!._id}/review`;
    expect((await a(nextPath, patch(proposal))).status).toBe(200); expect((await b(nextPath, patch(approve))).status).toBe(409);
  });

  it('closes wrong-account events only after independent review, and records outgoing reconciliation with evidence', async () => {
    const order = await seedOrder(db, customer.id); const attempt = await seedPaymentAttempt(db, order.id);
    const wrong = { ...inboundTransfer(attempt.reconciliationCode, 100000), accountNumber: '999999999' }; await sendWebhook(api, wrong);
    const event = await db.collection('payment_events').findOne({ eventId: wrong.id }); const evidenceA = await proof(adminA.id), evidenceB = await proof(adminB.id);
    const path = `/admin/payment-events/${event!._id}/review`;
    expect((await a(path, patch({ decision: 'CLOSED_NO_ACTION', note: 'Verified statement: receiving account is outside the merchant', evidenceObjectKey: evidenceA }))).status).toBe(200);
    expect((await b(path, patch({ decision: 'APPROVE', note: 'Independent bank account and receipt verification completed', evidenceObjectKey: evidenceB }))).status).toBe(200);
    const out = { ...inboundTransfer('', 50000), transferType: 'out' }; await sendWebhook(api, out);
    const outgoing = await db.collection('payment_events').findOne({ eventId: out.id }); const outPath = `/admin/payment-events/${outgoing!._id}/review`;
    expect((await a(outPath, patch({ decision: 'OUTGOING_RECONCILED', amount: 50000, bankReference: randomUUID(), note: 'External bank outflow reconciled with the accounting receipt', evidenceObjectKey: evidenceA }))).status).toBe(200);
    expect((await b(outPath, patch({ decision: 'APPROVE', note: 'Independent accounting verification completed', evidenceObjectKey: evidenceB }))).status).toBe(200);
  });

  it('paginates customer and assigned staff payments in MongoDB without returning other customers', async () => {
    const staff = await seedUser(db, 'STAFF', 'audit2-scope'); await grant(db, staff.id, 'payment.read', 'ASSIGNED');
    const mine = await seedOrder(db, customer.id, { assignedStaffId: staff.id }); const expected = await seedPaymentAttempt(db, mine.id);
    const other = await seedUser(db, 'CUSTOMER', 'audit2-foreign'); const foreign = await seedOrder(db, other.id); await seedPaymentAttempt(db, foreign.id);
    const request = authed(api, (await login(api, staff.email)).accessToken);
    const listed = await (await request('/payments?limit=1')).json(); expect(listed.total).toBe(1); expect(listed.items.map((p: { id: string }) => p.id)).toEqual([expected.id]);
    expect((await owner(`/payments/order/${foreign.id}/latest`)).status).toBe(404);
  });

  it('filters and price-sorts the same matching variants with a bounded page and accurate total', async () => {
    for (let i = 0; i < 4; i++) {
      const productId = new Types.ObjectId(); await db.collection('products').insertOne({ _id: productId, slug: 'audit2-' + i, name: 'Audit Product ' + i, status: 'PUBLISHED', price: 999999, imageMediaIds: [], createdAt: new Date() });
      await db.collection('product_variants').insertMany([{ productId, sku: randomUUID(), color: 'Blue', size: 'M', price: 100000 + i * 10000, status: 'ACTIVE', stockOnHand: 5, reserved: 0 }, { productId, sku: randomUUID(), color: 'Red', size: 'L', price: 1, status: 'ACTIVE', stockOnHand: 5, reserved: 0 }]);
    }
    const response = await fetch(api.baseUrl + '/products?color=Blue&size=M&minPrice=100000&maxPrice=130000&sort=price_desc&page=2&limit=1');
    expect(response.status).toBe(200); const body = await response.json(); expect(body.total).toBe(4); expect(body.items).toHaveLength(1); expect(body.items[0].price).toBe(120000);
  });

  it('returns the current permission snapshot and honors session-only cookies across rotation', async () => {
    const staff = await seedUser(db, 'STAFF', 'audit2-permissions'); await grant(db, staff.id, 'order.read', 'ASSIGNED');
    const logged = await fetch(api.baseUrl + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: staff.email, password: PASSWORD, remember: false }) });
    expect(logged.status).toBe(201); const payload = await logged.json(); expect(payload.user.permissions).toContainEqual({ permission: 'order.read', scope: 'ASSIGNED' });
    const cookie = logged.headers.getSetCookie().find(c => c.startsWith('refresh_token='))!; expect(cookie).not.toMatch(/Max-Age|Expires=/i); expect(cookie).toContain('HttpOnly');
    const rotated = await fetch(api.baseUrl + '/auth/refresh', { method: 'POST', headers: { Origin: WEB_ORIGIN, Cookie: cookie.split(';')[0] } });
    expect(rotated.status).toBe(201); expect(rotated.headers.getSetCookie().join(';')).not.toMatch(/Max-Age|Expires=/i);
    expect((await (await authed(api, payload.accessToken)('/users/me')).json()).permissions).toEqual(payload.user.permissions);
  });
});
