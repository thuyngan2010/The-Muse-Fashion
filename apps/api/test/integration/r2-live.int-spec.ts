import { DeleteObjectCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Connection } from 'mongoose';
import { authed, connectDb, login, seedUser, startApi, uniqueDbName, type RunningApi } from './harness.js';

const names = [
  'R2_E2E_ACCOUNT_ID', 'R2_E2E_ACCESS_KEY_ID', 'R2_E2E_SECRET_ACCESS_KEY',
  'R2_E2E_PUBLIC_BUCKET', 'R2_E2E_PRIVATE_BUCKET',
] as const;
const enabled = process.env.R2_E2E_ENABLED === 'true' && names.every((name) => Boolean(process.env[name]));

describe.skipIf(!enabled)('live Cloudflare R2 upload', () => {
  let db: Connection;
  let api: RunningApi;
  let client: S3Client;
  let token: string;
  const keys: string[] = [];
  const privateBucket = process.env.R2_E2E_PRIVATE_BUCKET!;

  beforeAll(async () => {
    const dbName = uniqueDbName('fc_r2_live');
    db = await connectDb(dbName);
    api = await startApi(dbName, {
      R2_ACCOUNT_ID: process.env.R2_E2E_ACCOUNT_ID!,
      R2_ACCESS_KEY_ID: process.env.R2_E2E_ACCESS_KEY_ID!,
      R2_SECRET_ACCESS_KEY: process.env.R2_E2E_SECRET_ACCESS_KEY!,
      R2_BUCKET: process.env.R2_E2E_PUBLIC_BUCKET!,
      R2_PRIVATE_BUCKET: privateBucket,
    });
    client = new S3Client({
      region: 'auto', endpoint: `https://${process.env.R2_E2E_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_E2E_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_E2E_SECRET_ACCESS_KEY!,
      },
    });
    const user = await seedUser(db, 'CUSTOMER', 'r2upload');
    token = (await login(api, user.email)).accessToken;
  });

  afterAll(async () => {
    try {
      if (client) {
        await Promise.all(keys.map((Key) => client.send(new DeleteObjectCommand({ Bucket: privateBucket, Key }))));
      }
    } finally {
      client?.destroy();
      await api?.stop();
      await db?.dropDatabase();
      await db?.close();
    }
  });

  it('uploads and finalizes a real image, then rejects a body larger than its signed Content-Length', async () => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVQImWNgYGD4DwABBAEAfbLI3wAAAABJRU5ErkJggg==',
      'base64',
    );
    const request = authed(api, token);
    async function presign() {
      const response = await request('/storage/presign', {
        method: 'POST', body: JSON.stringify({ contentType: 'image/png', sizeBytes: png.length, purpose: 'avatar' }),
      });
      expect(response.status).toBe(201);
      const signed = await response.json() as {
        uploadUrl: string; objectKey: string; requiredHeaders: Record<string, string>;
      };
      keys.push(signed.objectKey);
      return signed;
    }

    const valid = await presign();
    const uploaded = await fetch(valid.uploadUrl, {
      method: 'PUT', headers: valid.requiredHeaders, body: new Uint8Array(png),
    });
    expect(uploaded.ok).toBe(true);
    const finalized = await request('/storage/finalize', {
      method: 'POST', body: JSON.stringify({ objectKey: valid.objectKey }),
    });
    expect(finalized.status).toBe(201);
    expect((await finalized.json() as { status: string }).status).toBe('ACTIVE');
    expect((await db.collection('media_objects').findOne({ key: valid.objectKey }))?.status).toBe('READY');

    const oversized = await presign();
    const rejected = await fetch(oversized.uploadUrl, {
      method: 'PUT', headers: oversized.requiredHeaders,
      body: new Uint8Array(Buffer.concat([png, png])),
    });
    expect(rejected.status).toBeGreaterThanOrEqual(400);
    await expect(client.send(new HeadObjectCommand({ Bucket: privateBucket, Key: oversized.objectKey }))).rejects.toThrow();
  });

  it('uploads through the authenticated API fallback and finalizes a private try-on image', async () => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVQImWNgYGD4DwABBAEAfbLI3wAAAABJRU5ErkJggg==', 'base64',
    );
    const request = authed(api, token);
    const presign = await request('/storage/presign', { method: 'POST',
      body: JSON.stringify({ contentType: 'image/png', sizeBytes: png.length, purpose: 'tryon' }) });
    expect(presign.status).toBe(201);
    const signed = await presign.json() as { objectKey: string };
    keys.push(signed.objectKey);
    const body = new FormData();
    body.append('objectKey', signed.objectKey);
    body.append('file', new Blob([png], { type: 'image/png' }), 'fixture.png');
    const upload = (accessToken: string) => fetch(`${api.baseUrl}/storage/upload`, {
      method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, body,
    });
    const other = await seedUser(db, 'CUSTOMER', 'foreignupload');
    expect((await upload((await login(api, other.email)).accessToken)).status).toBe(404);
    expect((await upload(token)).status).toBe(201);
    expect((await client.send(new HeadObjectCommand({ Bucket: privateBucket, Key: signed.objectKey }))).ContentLength).toBe(png.length);
    // A lost upload response must not cause an overwrite on retry.
    expect((await upload(token)).status).toBe(201);
    const ready = await request('/storage/finalize', { method: 'POST', body: JSON.stringify({ objectKey: signed.objectKey }) });
    expect(ready.status).toBe(201);
    expect(await ready.json()).toMatchObject({ status: 'ACTIVE', visibility: 'PRIVATE', purpose: 'tryon' });
    expect((await upload(token)).status).toBe(422);
    expect((await db.collection('media_objects').findOne({ key: signed.objectKey }))?.status).toBe('READY');
  });
});
