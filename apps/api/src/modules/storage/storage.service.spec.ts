import { afterEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { CopyObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { Types } from 'mongoose';
import sharp from 'sharp';
import { AppConfig } from '../../common/app-config.js';
import { StorageService } from './storage.service.js';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

function r2Environment() {
  vi.stubEnv('R2_ACCOUNT_ID', '0123456789abcdef0123456789abcdef');
  vi.stubEnv('R2_ACCESS_KEY_ID', 'test-key');
  vi.stubEnv('R2_SECRET_ACCESS_KEY', 'test-secret');
  vi.stubEnv('R2_BUCKET', 'public-bucket');
  vi.stubEnv('R2_PRIVATE_BUCKET', 'private-bucket');
  vi.stubEnv('R2_UPLOAD_MAX_BYTES', '5242880');
}

describe('StorageService same-origin upload fallback', () => {
  function fixture() {
    r2Environment();
    const ownerId = String(new Types.ObjectId());
    const record = { ownerId, purpose: 'tryon', key: `tryon/${ownerId}/test.webp`, status: 'PENDING',
      contentType: 'image/webp', expectedSizeBytes: 4, expiresAt: new Date(Date.now() + 60_000) };
    const send = vi.fn().mockResolvedValue({});
    const service = new StorageService({ findOne: () => ({ exec: async () => record }) } as never,
      {} as never, {} as never, {} as never);
    vi.spyOn(service as never, 'client').mockReturnValue({ send } as never);
    const file = { buffer: Buffer.from('test'), mimetype: 'image/webp', size: 4 };
    return { service, send, record, ownerId, file, dto: { objectKey: record.key } };
  }

  it('writes only the declared private object and leaves validation to finalize', async () => {
    const { service, send, record, ownerId, file, dto } = fixture();
    expect(await service.upload(ownerId, dto, file)).toEqual({ uploaded: true });
    expect(send.mock.calls[0][0].input).toMatchObject({ Bucket: 'private-bucket', Key: record.key,
      Body: file.buffer, ContentLength: 4, ContentType: 'image/webp', IfNoneMatch: '*' });
    expect(record.status).toBe('PENDING');
  });

  it('cannot write an object owned by another user', async () => {
    const { service, send, file, dto } = fixture();
    await expect(service.upload(String(new Types.ObjectId()), dto, file)).rejects.toMatchObject({ status: 404 });
    expect(send).not.toHaveBeenCalled();
  });

  it.each(['size', 'type', 'expired', 'finalized'])( 'rejects %s mismatch before accessing R2', async (kind) => {
    const { service, send, record, ownerId, file, dto } = fixture();
    if (kind === 'size') record.expectedSizeBytes = 5;
    if (kind === 'type') file.mimetype = 'image/png';
    if (kind === 'expired') record.expiresAt = new Date(0);
    if (kind === 'finalized') record.status = 'READY';
    await expect(service.upload(ownerId, dto, file)).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });

  it('accepts create-once conflicts without overwriting an existing object', async () => {
    const { service, send, ownerId, file, dto } = fixture();
    send.mockRejectedValueOnce({ $metadata: { httpStatusCode: 412 } });
    await expect(service.upload(ownerId, dto, file)).resolves.toEqual({ uploaded: true });
    expect(send).toHaveBeenCalledOnce();
  });

  it('propagates storage failure instead of reporting a successful upload', async () => {
    const { service, send, ownerId, file, dto } = fixture();
    send.mockRejectedValueOnce(new Error('offline'));
    await expect(service.upload(ownerId, dto, file)).rejects.toMatchObject({ status: 503 });
  });
});

describe('StorageService upload limit', () => {
  it('keeps a finalized community orphan available for only 24 hours until content attaches it', async () => {
    r2Environment();
    const ownerId = String(new Types.ObjectId());
    const png = await sharp({ create: { width: 1, height: 1, channels: 3, background: '#ffffff' } }).png().toBuffer();
    const record: Record<string, any> = { _id: new Types.ObjectId(), ownerId,
      key: `community/${ownerId}/orphan.png`, purpose: 'community', visibility: 'PRIVATE',
      status: 'PENDING', expectedSizeBytes: png.length, expiresAt: new Date(Date.now() + 300_000) };
    const media = {
      findOne: () => ({ exec: async () => record }),
      findOneAndUpdate: (_filter: unknown, update: { $set?: object; $unset?: object }) => ({ exec: async () => {
        Object.assign(record, update.$set);
        for (const key of Object.keys(update.$unset ?? {})) delete record[key];
        return record;
      } }),
    };
    const service = new StorageService(media as never, {} as never, {} as never, {} as never);
    vi.spyOn(service as never, 'headObject').mockResolvedValue({ ContentType: 'image/png', ContentLength: png.length } as never);
    vi.spyOn(service as never, 'client').mockReturnValue({ send: async () => ({
      Body: { transformToByteArray: async () => png },
    }) } as never);
    const before = Date.now();
    const finalized = await service.finalize(ownerId, { objectKey: record.key });
    expect(finalized.status).toBe('ACTIVE');
    expect(record.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 24 * 60 * 60_000);
    expect(record.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 24 * 60 * 60_000);
  });

  it('signs the exact Content-Length, MIME type, and create-once condition', async () => {
    r2Environment();
    const create = vi.fn().mockResolvedValue({});
    const service = new StorageService({ create } as never, {} as never, {} as never, {} as never);
    const result = await service.presign(new Types.ObjectId().toString(), 'ADMIN',
      { purpose: 'product', contentType: 'image/png', sizeBytes: 123 });
    const signedHeaders = new URL(result.uploadUrl).searchParams.get('X-Amz-SignedHeaders')?.split(';');
    expect(signedHeaders).toEqual(expect.arrayContaining(['content-length', 'content-type', 'if-none-match']));
    expect(result).toMatchObject({ contentLengthBytes: 123,
      requiredHeaders: { 'Content-Type': 'image/png', 'If-None-Match': '*' } });
    expect(create).toHaveBeenCalledOnce();
  });

  it('rejects a declared size above the configured limit before signing', async () => {
    r2Environment();
    const create = vi.fn();
    const service = new StorageService({ create } as never, {} as never, {} as never, {} as never);
    await expect(service.presign(new Types.ObjectId().toString(), 'ADMIN',
      { purpose: 'product', contentType: 'image/png', sizeBytes: 5_242_881 }))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });

  it('deletes an expired upload that was never finalized', async () => {
    r2Environment();
    const record = { _id: new Types.ObjectId(), key: 'avatar/test/orphan.png', status: 'PENDING',
      visibility: 'PRIVATE', expiresAt: new Date(Date.now() - 1_000), save: vi.fn().mockResolvedValue(undefined) };
    const find = vi.fn()
      .mockReturnValueOnce({ limit: () => ({ exec: async () => [record] }) })
      .mockReturnValueOnce({ limit: () => ({ exec: async () => [] }) });
    const send = vi.fn().mockResolvedValue({});
    const service = new StorageService({ find } as never, {} as never, {} as never, {} as never);
    vi.spyOn(service as never, 'client').mockReturnValue({ send } as never);

    expect(await service.cleanupExpired()).toBe(1);
    expect(send.mock.calls[0][0].input).toMatchObject({ Bucket: 'private-bucket', Key: record.key });
    expect(record.status).toBe('DELETED');
    expect(record.save).toHaveBeenCalledOnce();
  });
});

describe('StorageService publication', () => {
  it('keeps a draft product upload private', async () => {
    const id = new Types.ObjectId();
    const record = { _id: id, key: `product/${new Types.ObjectId()}/${id}.png`,
      purpose: 'product', status: 'READY', visibility: 'PRIVATE' };
    const send = vi.fn().mockResolvedValue({});
    const media = {
      find: () => ({ exec: async () => [record] }),
      findOneAndUpdate: () => ({ exec: async () => record }),
      updateOne: () => ({ exec: async () => ({ modifiedCount: 1 }) }),
    };
    const products = { exists: vi.fn().mockResolvedValue(null) };
    const service = new StorageService(media as never, products as never, {} as never, {} as never);
    vi.spyOn(service as never, 'client').mockReturnValue({ send } as never);

    await service.reconcileMediaIds([String(id)]);
    expect(products.exists).toHaveBeenCalledWith({ status: 'PUBLISHED', imageMediaIds: String(id) });
    expect(send).not.toHaveBeenCalled();
  });

  it('copies media into the public bucket only when a product is published', async () => {
    const id = new Types.ObjectId();
    const record = { _id: id, key: `product/${new Types.ObjectId()}/${id}.png`,
      purpose: 'product', status: 'READY', visibility: 'PRIVATE' };
    const send = vi.fn().mockResolvedValue({});
    const updateOne = vi.fn().mockReturnValue({ exec: async () => ({ modifiedCount: 1 }) });
    const media = {
      find: () => ({ exec: async () => [record] }),
      findOneAndUpdate: () => ({ exec: async () => record }),
      updateOne,
    };
    vi.spyOn(AppConfig, 'require').mockImplementation((name) => name === 'R2_BUCKET' ? 'public' : 'private');
    const service = new StorageService(media as never,
      { exists: async () => ({ _id: id }) } as never, {} as never, {} as never);
    vi.spyOn(service as never, 'client').mockReturnValue({ send } as never);

    await service.reconcileMediaIds([String(id)]);
    const copy = send.mock.calls.find(([command]) => command instanceof CopyObjectCommand)?.[0] as CopyObjectCommand | undefined;
    expect(copy?.input).toMatchObject({ Bucket: 'public', Key: record.key, CopySource: `private/${record.key}` });
    expect(updateOne).toHaveBeenCalledWith(
      { _id: id, status: 'READY', visibility: 'PRIVATE', publicationLeaseId: expect.any(String), pendingBucket: 'PUBLIC' },
      { $set: { visibility: 'PUBLIC', staleBucket: 'PRIVATE' }, $unset: { pendingBucket: 1 } },
    );
  });

  it('removes a staged public copy left by an interrupted publish', async () => {
    const id = new Types.ObjectId();
    const record = { _id: id, key: `product/${new Types.ObjectId()}/${id}.png`,
      purpose: 'product', status: 'READY', visibility: 'PRIVATE', pendingBucket: 'PUBLIC' };
    const send = vi.fn().mockResolvedValue({});
    const media = {
      find: () => ({ exec: async () => [record] }),
      findOneAndUpdate: () => ({ exec: async () => record }),
      updateOne: () => ({ exec: async () => ({ modifiedCount: 1 }) }),
    };
    vi.spyOn(AppConfig, 'require').mockImplementation((name) => name === 'R2_BUCKET' ? 'public' : 'private');
    const service = new StorageService(media as never,
      { exists: async () => null } as never, {} as never, {} as never);
    vi.spyOn(service as never, 'client').mockReturnValue({ send } as never);

    await service.reconcileMediaIds([String(id)]);
    const removed = send.mock.calls.find(([command]) => command instanceof DeleteObjectCommand)?.[0] as DeleteObjectCommand | undefined;
    expect(removed?.input).toMatchObject({ Bucket: 'public', Key: record.key });
    expect(send.mock.calls.some(([command]) => command instanceof CopyObjectCommand)).toBe(false);
  });
});
