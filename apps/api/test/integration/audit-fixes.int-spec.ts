import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Types, type Connection } from 'mongoose';
import { authed, connectDb, grant, login, seedOrder, seedPaymentAttempt, seedUser, startApi, uniqueDbName, type RunningApi } from './harness.js';
import { StorageService } from '../../src/modules/storage/storage.service.js';
import { MediaObject, MediaObjectSchema } from '../../src/modules/storage/media-object.schema.js';
import { AiJob, AiJobSchema } from '../../src/modules/ai/ai.schemas.js';
import { AiService } from '../../src/modules/ai/ai.service.js';

let db: Connection;
let api: RunningApi;
let admin: Awaited<ReturnType<typeof seedUser>>;
let customer: Awaited<ReturnType<typeof seedUser>>;
let adminRequest: ReturnType<typeof authed>;
let customerRequest: ReturnType<typeof authed>;

beforeAll(async () => {
  const name = uniqueDbName('audit_fixes');
  db = await connectDb(name);
  api = await startApi(name);
  admin = await seedUser(db, 'ADMIN', 'fix-admin');
  customer = await seedUser(db, 'CUSTOMER', 'fix-customer');
  adminRequest = authed(api, (await login(api, admin.email)).accessToken);
  customerRequest = authed(api, (await login(api, customer.email)).accessToken);
});
afterAll(async () => { await api?.stop(); await db?.dropDatabase(); await db?.close(); });

describe('Audit fixes through real HTTP and MongoDB transactions', () => {
  it('rejects voucher renaming and still releases usage and reserved stock on cancellation', async () => {
    const voucherId = new Types.ObjectId(), variantId = new Types.ObjectId();
    await db.collection('vouchers').insertOne({ _id: voucherId, code: 'FIX_OLD', type: 'FIXED', value: 10000,
      minimumSubtotal: 0, validFrom: new Date(Date.now() - 86400000), validTo: new Date(Date.now() + 86400000),
      usageLimit: 100, usedCount: 1, status: 'ACTIVE' });
    await db.collection('product_variants').insertOne({ _id: variantId, productId: new Types.ObjectId(),
      sku: `FIX-${randomUUID()}`, stockOnHand: 5, reserved: 1, price: 100000, status: 'ACTIVE', version: 1 });
    const order = await seedOrder(db, customer.id);
    await db.collection('orders').updateOne({ _id: new Types.ObjectId(order.id) }, { $set: {
      voucherCode: 'FIX_OLD', items: [{ variantId: String(variantId), quantity: 1, lineId: String(new Types.ObjectId()) }],
    } });
    expect((await adminRequest(`/admin/vouchers/${voucherId}`, { method: 'PATCH', body: JSON.stringify({ code: 'FIX_NEW' }) })).status).toBe(409);
    const response = await customerRequest(`/orders/${order.id}/cancel`, { method: 'POST', headers: { 'idempotency-key': randomUUID() }, body: JSON.stringify({ reason: 'Regression cancellation' }) });
    expect(response.status, await response.text()).toBe(201);
    expect((await db.collection('orders').findOne({ _id: new Types.ObjectId(order.id) }))?.state).toBe('CANCELLED');
    expect((await db.collection('product_variants').findOne({ _id: variantId }))?.reserved).toBe(0);
    expect((await db.collection('vouchers').findOne({ _id: voucherId }))?.usedCount).toBe(0);
  });

  it('adds staff permissions without losing grants and replaces only on PATCH', async () => {
    const staff = await seedUser(db, 'STAFF', 'fix-staff');
    await grant(db, staff.id, 'inventory.manage', 'GLOBAL');
    const path = `/admin/staff/${staff.id}/permissions`;
    const add = await adminRequest(path, { method: 'POST', body: JSON.stringify({ grants: [{ permission: 'order.read', scope: 'GLOBAL' }] }) });
    expect(add.status, await add.text()).toBe(201);
    let permissions = await (await adminRequest(path)).json();
    expect(permissions.grants.map((g: { permission: string }) => g.permission).sort()).toEqual(['inventory.manage', 'order.read']);
    const replace = await adminRequest(path, { method: 'PATCH', body: JSON.stringify({ grants: [{ permission: 'order.read', scope: 'ASSIGNED' }] }) });
    expect(replace.status, await replace.text()).toBe(200);
    permissions = await (await adminRequest(path)).json();
    expect(permissions.grants).toEqual([{ permission: 'order.read', scope: 'ASSIGNED' }]);
    const users = await adminRequest('/admin/users?role=STAFF&page=1&limit=50');
    expect(users.status).toBe(200);
    expect((await users.json()).items.map((u: { id: string }) => u.id)).toContain(staff.id);
  });

  it('enforces order page limits and migrates legacy password hashes on login', async () => {
    await seedOrder(db, customer.id); await seedOrder(db, customer.id);
    const page = await (await adminRequest('/admin/orders?page=1&limit=1')).json();
    expect(page.items).toHaveLength(1); expect(page.total).toBeGreaterThan(1);
    const user = await db.collection('users').findOne({ _id: new Types.ObjectId(customer.id) });
    expect(user?.passwordHash).toMatch(/^\$scrypt\$/);
  });

  it('returns real draft variants and hidden categories only through protected catalog routes', async () => {
    const categoryId = new Types.ObjectId(), productId = new Types.ObjectId(), variantId = new Types.ObjectId();
    await db.collection('categories').insertOne({ _id: categoryId, name: 'Hidden', slug: 'fix-hidden', status: 'HIDDEN' });
    await db.collection('products').insertOne({ _id: productId, name: 'Draft', slug: 'fix-draft', description: 'Draft product', categoryId, status: 'DRAFT', imageMediaIds: [] });
    await db.collection('product_variants').insertOne({ _id: variantId, productId, sku: 'FIX-DRAFT', size: 'L', color: 'Blue', price: 150000, status: 'INACTIVE', stockOnHand: 5, reserved: 1 });
    const response = await adminRequest(`/admin/products/${productId}`);
    expect(response.status, response.status !== 200 ? await response.text() : '').toBe(200);
    expect((await response.json()).variants[0]).toMatchObject({ id: String(variantId), size: 'L', color: 'Blue', price: 150000, status: 'INACTIVE' });
    expect((await (await adminRequest('/admin/categories')).json()).items.map((c: { id: string }) => c.id)).toContain(String(categoryId));
    expect((await (await fetch(`${api.baseUrl}/categories`)).json()).items.map((c: { id: string }) => c.id)).not.toContain(String(categoryId));
    expect((await customerRequest(`/admin/products/${productId}`)).status).toBe(403);
  });

  it('restores an owned review after reload and supports recreating a deleted review', async () => {
    const order = await seedOrder(db, customer.id, { state: 'DELIVERED' });
    const lineId = String(new Types.ObjectId()), productId = String(new Types.ObjectId());
    await db.collection('orders').updateOne({ _id: new Types.ObjectId(order.id) }, { $set: { items: [{ lineId, productId, variantId: String(new Types.ObjectId()), quantity: 1 }] } });
    const payload = { orderItemId: lineId, stars: 4, content: 'Good quality', mediaIds: [] };
    const response = await customerRequest('/reviews', { method: 'POST', body: JSON.stringify(payload) });
    expect(response.status, response.status !== 201 ? await response.text() : '').toBe(201);
    const review = await response.json();
    const mine = await (await customerRequest(`/reviews/mine?orderId=${order.id}`)).json();
    expect(mine.items[0]).toMatchObject({ id: review.id, orderItemId: lineId, stars: 4 });
    const other = await seedUser(db, 'CUSTOMER', 'fix-other');
    const otherRequest = authed(api, (await login(api, other.email)).accessToken);
    expect((await otherRequest(`/reviews/mine?orderId=${order.id}`)).status).toBe(404);
    expect((await customerRequest(`/reviews/${review.id}`, { method: 'DELETE' })).status).toBe(204);
    const recreated = await customerRequest('/reviews', { method: 'POST', body: JSON.stringify({ ...payload, stars: 5 }) });
    expect(recreated.status, await recreated.text()).toBe(201);
  });

  it('paginates moderation across comments and retains readable hidden content', async () => {
    const authorId = new Types.ObjectId(customer.id), postId = new Types.ObjectId();
    await db.collection('community_posts').insertOne({ _id: postId, authorId, caption: 'Hidden post', status: 'HIDDEN', createdAt: new Date() });
    await db.collection('comments').insertMany([1, 2].map(n => ({ postId, authorId, body: `Public comment ${n}`, status: 'PUBLIC', createdAt: new Date() })));
    const result = await (await adminRequest('/admin/moderation?targetType=COMMENT&status=PUBLIC&page=2&limit=1')).json();
    expect(result.total).toBe(2); expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ targetType: 'COMMENT', status: 'PUBLIC', authorId: customer.id });
    const hidden = await (await adminRequest('/admin/moderation?targetType=POST&status=HIDDEN')).json();
    expect(hidden.items.some((p: { id: string }) => p.id === String(postId))).toBe(true);
  });

  it('protects active AI inputs and prevents a new job attaching during object cleanup', async () => {
    const media = db.model(MediaObject.name, MediaObjectSchema);
    const jobs = db.model(AiJob.name, AiJobSchema);
    const key = `tryon/${customer.id}/${randomUUID()}.png`;
    const record = await media.create({ key, ownerId: customer.id, purpose: 'tryon', visibility: 'PRIVATE', status: 'READY', expiresAt: new Date(0) });
    const active = await db.collection('ai_jobs').insertOne({ ownerId: new Types.ObjectId(customer.id), inputKeys: [key], state: 'PROCESSING' });
    const storage = new StorageService(media, {} as never, {} as never, {} as never, jobs);
    expect(await storage.deleteMediaRecord(record)).toBe(false);
    expect((await media.findById(record._id))?.expiresAt?.getTime()).toBeGreaterThan(Date.now());
    await db.collection('ai_jobs').deleteOne({ _id: active.insertedId });
    // The cleanup worker holds a stale expired document after another job extended it.
    expect(await storage.deleteMediaRecord(record)).toBe(false);
    // Legacy input records may lack an expiry; terminal-job cleanup still owns them.
    await media.updateOne({ _id: record._id }, { $unset: { expiresAt: 1 } });
    const release: { resolve?: () => void } = {};
    const blockedDelete = new Promise<void>(resolve => { release.resolve = resolve; });
    const deleteSpy = vi.spyOn(storage as unknown as { deleteFromBucket: () => Promise<void> }, 'deleteFromBucket').mockImplementation(async () => blockedDelete);
    const cleanup = storage.deleteMediaRecord(record);
    try {
      await vi.waitFor(async () => { expect((await media.findById(record._id))?.cleanupClaimedAt).toBeDefined(); });
      const ai = new AiService(jobs, {} as never, {} as never, media, {} as never,
        { isEnabled: () => true } as never, storage, db, {} as never);
      await expect(ai.createTryOn(customer.id, randomUUID(), { inputMediaId: String(record._id),
        productIds: [String(new Types.ObjectId())], consentPolicyVersion: 'test-v1' })).rejects.toThrow('Input photo is unavailable');
    } finally {
      release.resolve?.();
      await cleanup;
      deleteSpy.mockRestore();
    }
    expect((await media.findById(record._id))?.status).toBe('DELETED');
  });

  it('separates proposal rejection from evidence-backed failure and reloads approved QR for admins', async () => {
    const staff = await seedUser(db, 'STAFF', 'fix-refund-proposer');
    await grant(db, staff.id, 'refund.propose', 'GLOBAL');
    const staffRequest = authed(api, (await login(api, staff.email)).accessToken);
    const order = await seedOrder(db, customer.id, { state: 'CANCEL_PENDING_REFUND' });
    const payment = await seedPaymentAttempt(db, order.id, { state: 'SUCCEEDED' });
    const propose = async () => staffRequest('/admin/refunds', { method: 'POST', headers: { 'idempotency-key': randomUUID() }, body: JSON.stringify({ paymentAttemptId: payment.id, amount: 100000, reason: 'Order cancelled', beneficiary: { bankBin: '970422', accountNumber: '1234567890', accountName: 'TEST USER' } }) });
    const first = await propose(); expect(first.status, first.status !== 201 ? await first.text() : '').toBe(201);
    const rejectedId = (await first.json()).id;
    const key = randomUUID(), rejection = { method: 'PATCH', headers: { 'idempotency-key': key }, body: JSON.stringify({ reason: 'Please correct the proposal' }) };
    const reject = await adminRequest(`/admin/refunds/${rejectedId}/reject`, rejection);
    expect(reject.status).toBe(200); expect((await reject.json()).failureReason).toBe('Please correct the proposal');
    expect((await adminRequest(`/admin/refunds/${rejectedId}/reject`, rejection)).status).toBe(200);
    const second = await propose(); expect(second.status, second.status !== 201 ? await second.text() : '').toBe(201);
    const refundId = (await second.json()).id;
    const approve = await adminRequest(`/admin/refunds/${refundId}/approve`, { method: 'PATCH', headers: { 'idempotency-key': randomUUID() }, body: '{}' });
    expect(approve.status, approve.status !== 200 ? await approve.text() : '').toBe(200);
    const detail = await (await adminRequest(`/admin/refunds/${refundId}`)).json();
    expect(detail.qrImageUrl).toMatch(/^https:\/\//); expect(detail.transferContent).toMatch(/^RF/);
    expect(await (await staffRequest(`/admin/refunds/${refundId}`)).json()).not.toHaveProperty('qrImageUrl');
    const failure = await adminRequest(`/admin/refunds/${refundId}/fail`, { method: 'PATCH', headers: { 'idempotency-key': randomUUID() }, body: JSON.stringify({ reason: 'Transfer failed' }) });
    expect(failure.status).toBe(400);
    const invalidRejection = await adminRequest(`/admin/refunds/${refundId}/reject`, { method: 'PATCH', headers: { 'idempotency-key': randomUUID() }, body: JSON.stringify({ reason: 'Wrong action' }) });
    expect(invalidRejection.status).toBe(409);
  });
});
