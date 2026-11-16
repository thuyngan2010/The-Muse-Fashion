import 'reflect-metadata';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { Types } from 'mongoose';
import sharp from 'sharp';
import { StorageService } from '../../apps/api/dist/modules/storage/storage.service.js';
import { MediaObjectSchema } from '../../apps/api/dist/modules/storage/media-object.schema.js';
import { uniqueDbName, connectDb, startApi, seedUser, login, authed } from '../../tests/helpers/api-harness.mjs';

// All object storage operations are stubbed. The only HTTP server and DB are isolated local fixtures.
process.env.R2_UPLOAD_MAX_BYTES = '5242880';
process.env.R2_PRIVATE_BUCKET = 'private-test-fixture';
const image = await sharp({ create: { width: 1, height: 1, channels: 3, background: '#ffffff' } }).png().toBuffer();
const ownerId = new Types.ObjectId().toString();
const record = { _id: new Types.ObjectId(), ownerId, key: `community/${ownerId}/fixture.png`, purpose: 'community',
  status: 'PENDING', visibility: 'PRIVATE', contentType: 'image/png', expectedSizeBytes: image.length,
  expiresAt: new Date(Date.now() + 24 * 60 * 60_000) };
const finalizeUpdates = [];
const finalizer = new StorageService({
  findOne: () => ({ exec: async () => record }),
  findOneAndUpdate: (_filter, update) => ({ exec: async () => {
    finalizeUpdates.push(update);
    Object.assign(record, update.$set ?? {});
    for (const name of Object.keys(update.$unset ?? {})) delete record[name];
    return record;
  } }),
}, {}, {}, {});
finalizer.headObject = async () => ({ ContentType: 'image/png', ContentLength: image.length });
finalizer.client = () => ({ send: async (command) => command.constructor.name === 'GetObjectCommand'
  ? { Body: { transformToByteArray: async () => image } } : {} });
await finalizer.finalize(ownerId, { objectKey: record.key });
assert.equal(record.status, 'READY');
assert.equal(record.expiresAt, undefined);

const dbName = uniqueDbName('audit_media_retention');
const db = await connectDb(dbName);
let api;
try {
  api = await startApi(dbName);
  const user = await seedUser(db, 'CUSTOMER', 'retention-audit');
  const session = await login(api, user.email);
  const request = authed(api, session.accessToken);
  const mediaId = new Types.ObjectId();
  const oldDate = new Date(Date.now() - 40 * 24 * 60 * 60_000);
  await db.collection('media_objects').insertOne({ _id: mediaId, key: `community/${user.id}/fixture.png`,
    ownerId: new Types.ObjectId(user.id), purpose: 'community', visibility: 'PRIVATE', status: 'READY',
    contentType: 'image/png', sizeBytes: image.length, createdAt: oldDate, updatedAt: oldDate });
  const create = await request('/community/posts', { method: 'POST', body: JSON.stringify({
    caption: 'Retention audit fixture', mediaIds: [mediaId.toString()],
  }) });
  assert.equal(create.status, 201);
  const post = await create.json();
  const remove = await request(`/community/posts/${post.id}`, { method: 'DELETE' });
  assert.equal(remove.status, 204);
  const afterDelete = await db.collection('media_objects').findOne({ _id: mediaId });
  assert.equal(afterDelete.expiresAt, undefined);
  // Age the deletion itself beyond the documented 30-day retention period.
  await db.collection('community_posts').updateOne({ _id: new Types.ObjectId(post.id) }, { $set: { deletedAt: oldDate } });
  const mediaModel = db.model('AuditRetentionMediaObject', MediaObjectSchema);
  const cleaner = new StorageService(mediaModel, {}, {}, {});
  let objectStorageCalls = 0;
  cleaner.client = () => ({ send: async () => { objectStorageCalls++; return {}; } });
  const cleaned = await cleaner.cleanupExpired();
  const afterCleanup = await db.collection('media_objects').findOne({ _id: mediaId });
  assert.equal(cleaned, 0);
  assert.equal(objectStorageCalls, 0);
  assert.equal(afterCleanup.status, 'READY');
  const result = { isolatedDb: dbName, finalizeRemovedExpiry: true, createPostStatus: create.status,
    deletePostStatus: remove.status, deletedMediaHasExpiry: false, simulatedDeletionAgeDays: 40,
    cleanupSelectedRecords: cleaned, objectStorageCalls, mediaStatusAfterCleanup: afterCleanup.status,
    finalizeReadyUpdate: finalizeUpdates.at(-1) };
  await writeFile(new URL('./security-retention-results.json', import.meta.url), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
} finally {
  await api?.stop();
  await db.dropDatabase();
  await db.close();
}
