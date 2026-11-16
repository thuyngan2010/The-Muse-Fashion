import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Types, type Connection } from 'mongoose';
import { authed, connectDb, login, seedOrder, seedUser, startApi, uniqueDbName, type RunningApi } from './harness.js';
import { StorageService } from '../../src/modules/storage/storage.service.js';
import { MediaObjectSchema } from '../../src/modules/storage/media-object.schema.js';

const DAY = 24 * 60 * 60_000;
let db: Connection;
let api: RunningApi;
let customer: Awaited<ReturnType<typeof seedUser>>;
let request: ReturnType<typeof authed>;

beforeAll(async () => {
  const dbName = uniqueDbName('community_retention');
  db = await connectDb(dbName);
  api = await startApi(dbName);
  customer = await seedUser(db, 'CUSTOMER', 'retention-customer');
  request = authed(api, (await login(api, customer.email)).accessToken);
});
afterAll(async () => { await api?.stop(); await db?.dropDatabase(); await db?.close(); });

async function media() {
  const id = new Types.ObjectId();
  await db.collection('media_objects').insertOne({ _id: id, ownerId: new Types.ObjectId(customer.id),
    purpose: 'community', key: `community/${customer.id}/${randomUUID()}.png`, visibility: 'PRIVATE',
    status: 'READY', contentType: 'image/png', expiresAt: new Date(Date.now() + DAY) });
  return id;
}
async function post(id: Types.ObjectId) {
  const response = await request('/community/posts', { method: 'POST', body: JSON.stringify({ caption: 'Retention fixture', mediaIds: [String(id)] }) });
  expect(response.status).toBe(201);
  return response.json() as Promise<{ id: string }>;
}
function cleaner() {
  const model = db.models.RetentionMedia ?? db.model('RetentionMedia', MediaObjectSchema);
  const service = new StorageService(model, {} as never, {} as never, {} as never);
  const send = vi.fn().mockResolvedValue({});
  vi.spyOn(service as never, 'client').mockReturnValue({ send } as never);
  vi.spyOn(service as never, 'privateBucket').mockReturnValue('retention-test-private');
  return { service, send, model };
}

describe('community media lifecycle', () => {
  it('keeps shared post media until the final reference is removed and allows reuse before expiry', async () => {
    const id = await media();
    const first = await post(id);
    const second = await post(id);
    expect((await db.collection('media_objects').findOne({ _id: id }))?.expiresAt).toBeUndefined();
    expect((await request(`/community/posts/${first.id}`, { method: 'DELETE' })).status).toBe(204);
    expect((await db.collection('media_objects').findOne({ _id: id }))?.expiresAt).toBeUndefined();
    const before = Date.now();
    expect((await request(`/community/posts/${second.id}`, { method: 'DELETE' })).status).toBe(204);
    const detached = await db.collection('media_objects').findOne({ _id: id });
    expect(detached?.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 30 * DAY);
    expect(detached?.expiresAt.getTime()).toBeLessThan(Date.now() + 30 * DAY + 1000);
    await post(id);
    expect((await db.collection('media_objects').findOne({ _id: id }))?.expiresAt).toBeUndefined();
  });

  it('schedules replaced post media, while pending/hidden review references protect a shared image', async () => {
    const old = await media();
    const replacement = await media();
    const first = await post(old);
    const order = await seedOrder(db, customer.id, { state: 'DELIVERED' });
    const lineId = new Types.ObjectId();
    await db.collection('orders').updateOne({ _id: new Types.ObjectId(order.id) }, { $set: {
      items: [{ lineId: String(lineId), productId: String(new Types.ObjectId()), quantity: 1 }],
    } });
    const reviewResponse = await request('/reviews', { method: 'POST', body: JSON.stringify({
      orderItemId: String(lineId), stars: 5, content: 'Shared review photo', mediaIds: [String(old)],
    }) });
    expect(reviewResponse.status).toBe(201);
    const review = await reviewResponse.json() as { id: string };
    expect((await request(`/community/posts/${first.id}`, { method: 'PATCH', body: JSON.stringify({
      caption: 'Replaced image', mediaIds: [String(replacement)],
    }) })).status).toBe(200);
    expect((await db.collection('media_objects').findOne({ _id: old }))?.expiresAt).toBeUndefined();
    await db.collection('reviews').updateOne({ _id: new Types.ObjectId(review.id) }, { $set: { status: 'HIDDEN' } });
    const { service, send } = cleaner();
    await db.collection('media_objects').updateOne({ _id: old }, { $set: { expiresAt: new Date(0) } });
    await service.cleanupExpired();
    expect(send).not.toHaveBeenCalled();
    expect((await db.collection('media_objects').findOne({ _id: old }))?.expiresAt).toBeUndefined();
    expect((await request(`/reviews/${review.id}`, { method: 'DELETE' })).status).toBe(204);
    expect((await db.collection('media_objects').findOne({ _id: old }))?.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * DAY);
  });

  it('repairs legacy deleted media and deletes it without allowing a concurrent attachment', async () => {
    const id = await media();
    const first = await post(id);
    expect((await request(`/community/posts/${first.id}`, { method: 'DELETE' })).status).toBe(204);
    const deletedAt = new Date(Date.now() - 40 * DAY);
    await db.collection('community_posts').updateOne({ _id: new Types.ObjectId(first.id) }, { $set: { deletedAt } });
    await db.collection('media_objects').updateOne({ _id: id }, { $unset: { expiresAt: 1 } });
    const { service, send, model } = cleaner();
    await service.reconcileCommunityRetention(100);
    expect((await db.collection('media_objects').findOne({ _id: id }))?.expiresAt.getTime()).toBe(deletedAt.getTime() + 30 * DAY);
    let releaseDeletion!: () => void;
    let enteredDeletion!: () => void;
    const entered = new Promise<void>(resolve => { enteredDeletion = resolve; });
    const paused = new Promise<void>(resolve => { releaseDeletion = resolve; });
    send.mockImplementationOnce(async () => { enteredDeletion(); await paused; return {}; });
    const record = await model.findById(id).exec();
    const deleting = service.deleteMediaRecord(record!);
    await entered;
    try {
      const attempted = await request('/community/posts', { method: 'POST', body: JSON.stringify({
        caption: 'Cannot attach during cleanup', mediaIds: [String(id)],
      }) });
      expect(attempted.status).toBe(400);
      expect(await db.collection('community_posts').countDocuments({ mediaIds: id, deletedAt: null })).toBe(0);
    } finally { releaseDeletion(); }
    expect(await deleting).toBe(true);
    expect((await db.collection('media_objects').findOne({ _id: id }))?.status).toBe('DELETED');
  });

  it('retries a crashed or failed cleanup claim without reopening it for new content', async () => {
    const id = await media();
    await db.collection('media_objects').updateOne({ _id: id }, { $set: {
      expiresAt: new Date(0), cleanupClaimedAt: new Date(0),
    } });
    const { service, send, model } = cleaner();
    send.mockRejectedValueOnce({ name: 'AccessDenied', $metadata: { httpStatusCode: 403 } });
    expect(await service.deleteMediaRecord((await model.findById(id).exec())!)).toBe(false);
    const failed = await db.collection('media_objects').findOne({ _id: id });
    expect(failed?.status).toBe('READY');
    expect(failed?.cleanupClaimedAt).toBeInstanceOf(Date);
    expect(failed?.expiresAt.getTime()).toBeGreaterThan(Date.now());
    const attempted = await request('/community/posts', { method: 'POST', body: JSON.stringify({
      caption: 'Claim must remain closed while deletion retries', mediaIds: [String(id)],
    }) });
    expect(attempted.status).toBe(400);
    await db.collection('media_objects').updateOne({ _id: id }, { $set: { expiresAt: new Date(0) } });
    expect(await service.deleteMediaRecord((await model.findById(id).exec())!)).toBe(true);
    expect((await db.collection('media_objects').findOne({ _id: id }))?.status).toBe('DELETED');
  });
});
