import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Types, type Connection } from 'mongoose';
import { authed, connectDb, login, seedOrder, seedPaymentAttempt, seedUser, startApi, uniqueDbName, type RunningApi } from './harness.js';

let db: Connection;
let api: RunningApi;
let request: ReturnType<typeof authed>;
let adminRequest: ReturnType<typeof authed>;
let otherRequest: ReturnType<typeof authed>;
let owner: Awaited<ReturnType<typeof seedUser>>;
let other: Awaited<ReturnType<typeof seedUser>>;
let orderId: string;
const productId = new Types.ObjectId();
const ownId = new Types.ObjectId(), otherId = new Types.ObjectId(), deletedId = new Types.ObjectId();

beforeAll(async () => {
  const name = uniqueDbName('fc_review_owner_lookup');
  db = await connectDb(name); api = await startApi(name);
  owner = await seedUser(db, 'CUSTOMER', 'review-owner');
  other = await seedUser(db, 'CUSTOMER', 'review-other');
  const admin = await seedUser(db, 'ADMIN', 'review-admin');
  request = authed(api, (await login(api, owner.email)).accessToken);
  otherRequest = authed(api, (await login(api, other.email)).accessToken);
  adminRequest = authed(api, (await login(api, admin.email)).accessToken);
  const order = await seedOrder(db, owner.id, { state: 'DELIVERED' }); orderId = order.id;
  const rows = [{ id: ownId, customerId: owner.id }, { id: otherId, customerId: other.id }, { id: deletedId, customerId: owner.id, deletedAt: new Date() }];
  await db.collection('reviews').insertMany(rows.map(row => ({ _id: row.id, orderId: new Types.ObjectId(orderId),
    orderItemId: new Types.ObjectId(), productId, customerId: new Types.ObjectId(row.customerId),
    stars: 5, content: 'Review lookup regression', mediaIds: [], status: 'PUBLIC', ...(row.deletedAt ? { deletedAt: row.deletedAt } : {}) })));
});
afterAll(async () => { await api?.stop(); await db?.dropDatabase(); await db?.close(); });

describe('Private product review management lookup', () => {
  it('returns only requested owned nondeleted reviews and preserves the owned-order query', async () => {
    const response = await request(`/reviews/mine?reviewIds=${ownId}&reviewIds=${otherId}&reviewIds=${deletedId}`);
    expect(response.status).toBe(200);
    const lookup = await response.json();
    expect(lookup.items).toHaveLength(1);
    expect(lookup.items[0]).toMatchObject({ id: String(ownId), customerId: owner.id });
    expect(lookup.items[0].orderItemId).toMatch(/^[a-f0-9]{24}$/);
    const single = await request(`/reviews/mine?reviewIds=${ownId}`);
    expect(single.status).toBe(200); expect((await single.json()).items).toHaveLength(1);
    const legacy = await request(`/reviews/mine?orderId=${orderId}`);
    expect(legacy.status).toBe(200); expect((await legacy.json()).items.map((row: { id: string }) => row.id)).toEqual([String(ownId)]);
    expect((await otherRequest(`/reviews/mine?orderId=${orderId}`)).status).toBe(404);
    const otherLookup = await otherRequest(`/reviews/mine?reviewIds=${ownId}`);
    expect((await otherLookup.json()).items).toEqual([]);
  });

  it('keeps ownership and order item identifiers out of public results and denies guest/admin lookups', async () => {
    const publicResponse = await fetch(`${api.baseUrl}/reviews?productId=${productId}`);
    expect(publicResponse.status).toBe(200);
    const publicRows = await publicResponse.json();
    expect(publicRows.items).toHaveLength(2);
    for (const row of publicRows.items) {
      expect(row).not.toHaveProperty('customerId'); expect(row).not.toHaveProperty('orderItemId');
    }
    expect((await fetch(`${api.baseUrl}/reviews/mine?reviewIds=${ownId}`)).status).toBe(401);
    expect((await adminRequest(`/reviews/mine?reviewIds=${ownId}`)).status).toBe(403);
    const page = await fetch(`${api.baseUrl}/reviews?productId=${productId}&page=2&limit=1`);
    const visible = await page.json(); expect(visible.items).toHaveLength(1);
    const lookup = await request(`/reviews/mine?reviewIds=${visible.items[0].id}`);
    const result = await lookup.json();
    expect(result.items.every((row: { id: string }) => visible.items.some((item: { id: string }) => item.id === row.id))).toBe(true);
  });

  it('requires exactly one bounded selector and validates every review ID', async () => {
    for (const path of ['/reviews/mine', `/reviews/mine?orderId=${orderId}&reviewIds=${ownId}`, '/reviews/mine?reviewIds=invalid',
      `/reviews/mine?${Array.from({ length: 51 }, () => `reviewIds=${new Types.ObjectId()}`).join('&')}`]) {
      expect((await request(path)).status, path).toBe(400);
    }
  });

  it('includes a full selected Vietnam day in sales queries and excludes the following midnight', async () => {
    for (const paidAt of ['2026-10-28T17:00:00.000Z', '2026-10-29T16:59:59.999Z', '2026-10-29T17:00:00.000Z']) {
      const order = await seedOrder(db, owner.id, { state: 'CONFIRMED' });
      const payment = await seedPaymentAttempt(db, order.id, { state: 'SUCCEEDED', amount: 100000 });
      await db.collection('payment_attempts').updateOne({ _id: new Types.ObjectId(payment.id) }, { $set: { paidAt: new Date(paidAt) } });
    }
    const response = await adminRequest('/admin/reports/sales?from=2026-10-28T17:00:00.000Z&to=2026-10-29T17:00:00.000Z');
    expect(response.status).toBe(200);
    const report = await response.json(); expect(report.paidRevenue).toBe(200000); expect(report.orderCount).toBe(2);
    expect(report.daily).toMatchObject([{ date: '2026-10-29', paidRevenue: 200000, paymentCount: 2 }]);
  });
});
