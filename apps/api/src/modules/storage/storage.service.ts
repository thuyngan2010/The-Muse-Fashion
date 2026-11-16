import { Injectable, BadRequestException, ForbiddenException, Logger, NotFoundException, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, type HydratedDocument } from 'mongoose';
import { S3Client, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand, GetObjectCommand, CopyObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import { AppConfig } from '../../common/app-config.js';
import { PresignDto, FinalizeDto } from './storage.dto.js';
import { MediaObject } from './media-object.schema.js';
import { UsersService } from '../users/users.service.js';
import type { UserRole } from '@fashion/contracts';
import { sanitizeImage } from './image-sanitize.util.js';
import { Product } from '../catalog/product.schema.js';
import { Lookbook } from '../lookbooks/lookbook.schema.js';
import { AiJob } from '../ai/ai.schemas.js';
import { COMMUNITY_RETENTION_MS, hasCommunityMediaReference } from '../community/community-media-retention.util.js';

const PUBLIC_PURPOSES = new Set(['product', 'lookbook']);
const HARD_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
const DELETE_MAX_ATTEMPTS = 3;
const DELETE_RETRY_BASE_MS = 250;
const DELETE_FAILURE_BACKOFF_MS = 15 * 60_000;
const TRANSIENT_NETWORK_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EPIPE', 'EAI_AGAIN']);

type StorageError = { name?: string; code?: string; $retryable?: unknown; $metadata?: { httpStatusCode?: number } };

export function isMissingObjectError(error: unknown): boolean {
  const err = (error ?? {}) as StorageError;
  return err.name === 'NoSuchKey' || (err.$metadata?.httpStatusCode === 404 && err.name !== 'NoSuchBucket');
}

export function isTransientStorageError(error: unknown): boolean {
  const err = (error ?? {}) as StorageError;
  const status = err.$metadata?.httpStatusCode ?? 0;
  return Boolean(err.$retryable) || status === 429 || status >= 500
    || ['TimeoutError', 'RequestTimeout', 'SlowDown', 'ServiceUnavailable', 'InternalError'].includes(err.name ?? '')
    || TRANSIENT_NETWORK_CODES.has(err.code ?? '');
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private publicationCursor?: Types.ObjectId;
  private communityRetentionCursor?: Types.ObjectId;

  constructor(
    @InjectModel(MediaObject.name) private readonly media: Model<MediaObject>,
    @InjectModel(Product.name) private readonly products: Model<Product>,
    @InjectModel(Lookbook.name) private readonly lookbooks: Model<Lookbook>,
    private readonly users: UsersService,
    @InjectModel(AiJob.name) private readonly aiJobs?: Model<AiJob>,
  ) {}

  async presign(userId: string, role: UserRole, dto: PresignDto) {
    const max = this.uploadMaxBytes();
    if (dto.sizeBytes > max) throw new BadRequestException(`Maximum allowed size is ${max}`);
    if (!['product', 'lookbook', 'community', 'avatar', 'tryon', 'refund_evidence'].includes(dto.purpose)) {
      throw new BadRequestException('Invalid purpose');
    }
    if (PUBLIC_PURPOSES.has(dto.purpose) && role !== 'ADMIN'
      && !(role === 'STAFF' && await this.users.hasPermissions(userId, ['catalog.manage']))) {
      throw new ForbiddenException('Catalog upload permission required');
    }
    if (['community', 'tryon'].includes(dto.purpose) && role !== 'CUSTOMER') {
      throw new ForbiddenException('Customer media purpose required');
    }
    if (dto.purpose === 'refund_evidence' && role !== 'ADMIN') {
      throw new ForbiddenException('Admin permission required for refund evidence');
    }
    const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[dto.contentType];
    const key = `${dto.purpose}/${userId}/${randomUUID()}.${extension}`;
    let uploadUrl: string;
    try {
      uploadUrl = await this.signedPutUrl(key, dto.contentType, dto.sizeBytes);
    } catch {
      throw new ServiceUnavailableException('Object storage is not configured');
    }
    await this.media.create({
      key,
      ownerId: userId,
      purpose: dto.purpose,
      visibility: 'PRIVATE',
      status: 'PENDING',
      contentType: dto.contentType,
      expectedSizeBytes: dto.sizeBytes,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    return { uploadUrl, objectKey: key, expiresInSeconds: 300, contentLengthBytes: dto.sizeBytes,
      requiredHeaders: { 'Content-Type': dto.contentType, 'If-None-Match': '*' } };
  }

  /** Same-origin fallback for browsers that cannot reach the presigned R2 endpoint. */
  async upload(userId: string, dto: FinalizeDto, file?: { buffer: Buffer; mimetype: string; size: number }) {
    if (!file?.buffer?.length || file.size !== file.buffer.length || file.size > this.uploadMaxBytes()) {
      throw new BadRequestException('Uploaded file size is invalid');
    }
    const record = await this.media.findOne({ key: dto.objectKey }).exec();
    if (!record || String(record.ownerId) !== userId) throw new NotFoundException('Upload not found');
    if (!record.key.startsWith(`${record.purpose}/${userId}/`)) throw new ForbiddenException('Object key does not match upload owner');
    if (record.status !== 'PENDING' || !record.expiresAt || record.expiresAt <= new Date()) {
      throw new UnprocessableEntityException('Upload is no longer available');
    }
    if (file.mimetype !== record.contentType || file.size !== record.expectedSizeBytes) {
      throw new BadRequestException('Uploaded file does not match the declared size or content type');
    }
    try {
      await this.client().send(new PutObjectCommand({
        Bucket: this.privateBucket(), Key: record.key, Body: file.buffer,
        ContentType: record.contentType, ContentLength: file.size, IfNoneMatch: '*',
      }));
    } catch (error) {
      // The direct PUT may have succeeded even if the browser could not read its response.
      // Never overwrite it; finalize will verify the existing object normally.
      if ((error as StorageError)?.$metadata?.httpStatusCode !== 412) {
        throw new ServiceUnavailableException('Unable to upload image to object storage');
      }
    }
    return { uploaded: true };
  }

  async finalize(userId: string, dto: FinalizeDto) {
    const record = await this.media.findOne({ key: dto.objectKey }).exec();
    if (!record) throw new NotFoundException('Upload not found');
    if (String(record.ownerId) !== userId) throw new ForbiddenException('Upload ownership mismatch');
    if (record.status !== 'PENDING' && record.status !== 'READY') {
      throw new UnprocessableEntityException('Upload is no longer available');
    }
    if (record.expiresAt && record.expiresAt <= new Date()) {
      throw new UnprocessableEntityException('Upload has expired');
    }
    if (record.status === 'READY') return this.mediaResponse(record);
    if (!dto.objectKey.startsWith(`${record.purpose}/${userId}/`)) {
      throw new ForbiddenException('Object key does not match upload owner');
    }
    const leaseUntil = new Date(Date.now() + 10 * 60_000);
    const claimed = await this.media.findOneAndUpdate({ _id: record._id, status: 'PENDING',
      expiresAt: { $gt: new Date() } },
    { $set: { status: 'FINALIZING', finalizeLeaseUntil: leaseUntil,
      ...(PUBLIC_PURPOSES.has(record.purpose) ? { visibility: 'PRIVATE' } : {}) } }, { new: true }).exec();
    if (!claimed) throw new UnprocessableEntityException('Upload is no longer available');

    let head;
    try {
      head = await this.headObject(dto.objectKey);
    } catch {
      await this.releaseFinalize(claimed);
      throw new ServiceUnavailableException('Unable to verify uploaded object');
    }
    const contentType = head.ContentType ?? '';
    const sizeBytes = Number(head.ContentLength ?? 0);
    const max = this.uploadMaxBytes();
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(contentType)) {
      await this.rejectFinalize(claimed);
      throw new UnprocessableEntityException('Unsupported content type');
    }
    if (sizeBytes < 1 || sizeBytes > max) {
      await this.rejectFinalize(claimed);
      throw new UnprocessableEntityException('Uploaded file size is invalid');
    }
    if (claimed.expectedSizeBytes && sizeBytes > claimed.expectedSizeBytes * 1.1) {
      await this.rejectFinalize(claimed);
      throw new UnprocessableEntityException('Uploaded file exceeds declared size');
    }

    let cleaned: Buffer;
    try {
      const object = await this.client().send(new GetObjectCommand({
        Bucket: this.privateBucket(), Key: dto.objectKey, Range: `bytes=0-${max}`,
      }));
      if (!object.Body) throw new Error('Uploaded object is empty');
      const bytes = Buffer.from(await object.Body.transformToByteArray());
      if (bytes.length < 1 || bytes.length > max) throw new UnprocessableEntityException('Uploaded file size is invalid');
      cleaned = await sanitizeImage(bytes, contentType);
      if (cleaned.length > max) throw new UnprocessableEntityException('Processed image exceeds size limit');
      await this.client().send(new PutObjectCommand({
        Bucket: claimed.visibility === 'PUBLIC' ? AppConfig.require('R2_BUCKET') : this.privateBucket(),
        Key: dto.objectKey, Body: cleaned, ContentType: contentType,
      }));
      if (claimed.visibility === 'PUBLIC') {
        await this.client().send(new DeleteObjectCommand({ Bucket: this.privateBucket(), Key: dto.objectKey }));
      }
    } catch (error) {
      if (error instanceof UnprocessableEntityException) {
        await this.rejectFinalize(claimed);
        throw error;
      }
      await this.releaseFinalize(claimed);
      throw new ServiceUnavailableException('Unable to validate uploaded image');
    }

    const ready = await this.media.findOneAndUpdate({ _id: claimed._id, status: 'FINALIZING',
      finalizeLeaseUntil: { $gt: new Date() }, expiresAt: { $gt: new Date() } },
    { $set: { status: 'READY', contentType, sizeBytes: cleaned.length,
      ...(['tryon', 'community'].includes(claimed.purpose) ? { expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) } : {}) },
    $unset: { finalizeLeaseUntil: 1, ...(['tryon', 'community'].includes(claimed.purpose) ? {} : { expiresAt: 1 }) } },
    { new: true }).exec();
    if (!ready) {
      await this.deleteFromBucket(claimed);
      throw new UnprocessableEntityException('Upload expired while finalizing');
    }
    return this.mediaResponse(ready);
  }

  private async rejectFinalize(record: HydratedDocument<MediaObject>): Promise<void> {
    await this.media.updateOne({ _id: record._id, status: 'FINALIZING', finalizeLeaseUntil: record.finalizeLeaseUntil },
      { $set: { status: 'REJECTED' }, $unset: { finalizeLeaseUntil: 1 } }).exec();
  }

  private async releaseFinalize(record: HydratedDocument<MediaObject>): Promise<void> {
    await this.media.updateOne({ _id: record._id, status: 'FINALIZING', finalizeLeaseUntil: record.finalizeLeaseUntil },
      { $set: { status: 'PENDING' }, $unset: { finalizeLeaseUntil: 1 } }).exec();
  }

  async signedReadUrl(key: string, expiresInSeconds = 300): Promise<string | null> {
    try {
      const record = await this.media.findOne({ key, status: 'READY' }).select('visibility expiresAt').lean().exec();
      if (!record || (record.expiresAt && record.expiresAt <= new Date())) return null;
      const client = this.client();
      const command = new GetObjectCommand({
        Bucket: record.visibility === 'PUBLIC' ? AppConfig.require('R2_BUCKET') : this.privateBucket(), Key: key,
      });
      return await getSignedUrl(client, command, { expiresIn: expiresInSeconds });
    } catch {
      return null;
    }
  }

  async reconcileMediaIds(ids: string[]): Promise<void> {
    const valid = [...new Set(ids)].filter((id) => Types.ObjectId.isValid(id));
    if (!valid.length) return;
    const records = await this.media.find({ _id: { $in: valid }, status: 'READY',
      purpose: { $in: [...PUBLIC_PURPOSES] } }).exec();
    for (const record of records) {
      try { await this.reconcilePublicationRecord(record); }
      catch (error) { this.logger.warn(`Media publication sync failed for ${record.key}: ${error instanceof Error ? error.message : 'unknown'}`); }
    }
  }

  async reconcilePublication(limit = 50): Promise<number> {
    const records = await this.media.find({ status: 'READY', purpose: { $in: [...PUBLIC_PURPOSES] },
      ...(this.publicationCursor ? { _id: { $gt: this.publicationCursor } } : {}) })
      .sort({ _id: 1 }).limit(limit).exec();
    if (!records.length) { this.publicationCursor = undefined; return 0; }
    for (const record of records) {
      try { await this.reconcilePublicationRecord(record); }
      catch (error) { this.logger.warn(`Media publication retry failed for ${record.key}: ${error instanceof Error ? error.message : 'unknown'}`); }
    }
    this.publicationCursor = records[records.length - 1]._id as Types.ObjectId;
    return records.length;
  }

  private async isReferencedByPublished(record: HydratedDocument<MediaObject>): Promise<boolean> {
    if (record.purpose === 'product') {
      return Boolean(await this.products.exists({ status: 'PUBLISHED', imageMediaIds: String(record._id) }));
    }
    return Boolean(await this.lookbooks.exists({ status: 'PUBLISHED', mainMediaId: String(record._id) }));
  }

  private async reconcilePublicationRecord(record: HydratedDocument<MediaObject>): Promise<void> {
    const leaseId = randomUUID();
    const locked = await this.media.findOneAndUpdate({ _id: record._id, status: 'READY', $or: [
      { publicationLeaseUntil: { $exists: false } },
      { publicationLeaseUntil: { $lte: new Date() } },
    ] }, { $set: { publicationLeaseId: leaseId,
      publicationLeaseUntil: new Date(Date.now() + 5 * 60_000) } }, { new: true }).exec();
    if (!locked) return;
    record = locked;
    try {
      if (record.pendingBucket && record.pendingBucket !== record.visibility) {
        if (!this.unifiedBucket()) {
          await this.deleteKey(record.pendingBucket === 'PUBLIC' ? AppConfig.require('R2_BUCKET') : this.privateBucket(),
            record.key);
        }
        await this.media.updateOne({ _id: record._id, publicationLeaseId: leaseId,
          pendingBucket: record.pendingBucket }, { $unset: { pendingBucket: 1 } }).exec();
      }
      if (record.staleBucket && record.staleBucket !== record.visibility) {
        if (!this.unifiedBucket()) {
          await this.deleteKey(record.staleBucket === 'PUBLIC' ? AppConfig.require('R2_BUCKET') : this.privateBucket(),
            record.key);
        }
        await this.media.updateOne({ _id: record._id, status: 'READY', visibility: record.visibility,
          staleBucket: record.staleBucket }, { $unset: { staleBucket: 1 } }).exec();
      }
      const shouldBePublic = await this.isReferencedByPublished(record);
      const target = shouldBePublic ? 'PUBLIC' : 'PRIVATE';
      if (record.visibility === target) return;
      if (this.unifiedBucket()) {
        await this.media.updateOne({ _id: record._id, status: 'READY', visibility: record.visibility,
          publicationLeaseId: leaseId },
        { $set: { visibility: target }, $unset: { pendingBucket: 1, staleBucket: 1 } }).exec();
        return;
      }
      const sourceBucket = record.visibility === 'PUBLIC' ? AppConfig.require('R2_BUCKET') : this.privateBucket();
      const targetBucket = target === 'PUBLIC' ? AppConfig.require('R2_BUCKET') : this.privateBucket();
      const staged = await this.media.updateOne({ _id: record._id, status: 'READY',
        visibility: record.visibility, publicationLeaseId: leaseId },
      { $set: { pendingBucket: target } }).exec();
      if (!staged.modifiedCount) return;
      await this.client().send(new CopyObjectCommand({
        Bucket: targetBucket, Key: record.key, CopySource: `${sourceBucket}/${record.key}`,
      }));
      if (await this.isReferencedByPublished(record) !== shouldBePublic) {
        await this.deleteKey(targetBucket, record.key);
        await this.media.updateOne({ _id: record._id, publicationLeaseId: leaseId,
          pendingBucket: target }, { $unset: { pendingBucket: 1 } }).exec();
        return;
      }
      const changed = await this.media.updateOne({ _id: record._id, status: 'READY', visibility: record.visibility,
        publicationLeaseId: leaseId, pendingBucket: target },
        { $set: { visibility: target, staleBucket: record.visibility }, $unset: { pendingBucket: 1 } }).exec();
      if (!changed.modifiedCount) return;
      await this.deleteKey(sourceBucket, record.key);
      await this.media.updateOne({ _id: record._id, status: 'READY', visibility: target,
        staleBucket: record.visibility }, { $unset: { staleBucket: 1 } }).exec();
    } finally {
      await this.media.updateOne({ _id: record._id, publicationLeaseId: leaseId },
        { $unset: { publicationLeaseId: 1, publicationLeaseUntil: 1 } }).exec();
    }
  }

  async assertRefundEvidenceReady(key: string, actorId: string): Promise<void> {
    const exists = await this.media.exists({ key, ownerId: actorId, purpose: 'refund_evidence',
      visibility: 'PRIVATE', status: 'READY' }).exec();
    if (!exists) throw new UnprocessableEntityException('Refund evidence is not a finalized private upload owned by the actor');
  }

  async deleteMediaRecord(record: HydratedDocument<MediaObject>, removeRecord = false): Promise<boolean> {
    if (record.purpose === 'community' && record.status === 'READY') {
      // Content attachment writes this same media document in its transaction.
      // Once claimed, no new Post/Review can attach until cleanup has finished.
      const claimed = await this.media.findOneAndUpdate({ _id: record._id, purpose: 'community', status: 'READY',
        expiresAt: { $lte: new Date() } }, { $set: { cleanupClaimedAt: new Date() } }, { returnDocument: 'after' }).exec();
      if (!claimed) return false;
      if (await hasCommunityMediaReference(this.media, claimed._id as Types.ObjectId)) {
        await this.media.updateOne({ _id: claimed._id, status: 'READY' },
          { $unset: { expiresAt: 1, cleanupClaimedAt: 1 } }).exec();
        return false;
      }
      return this.deleteObject(claimed, removeRecord);
    }
    if (record.purpose === 'tryon' && record.status === 'READY' && this.aiJobs
      && await this.aiJobs.exists({ inputKeys: record.key, state: { $in: ['PENDING', 'PROCESSING'] } }).exec()) {
      await this.media.updateOne({ _id: record._id, cleanupClaimedAt: { $exists: false } },
        { $max: { expiresAt: new Date(Date.now() + 60 * 60_000) } }).exec();
      return false;
    }
    if (record.purpose === 'tryon' && record.status === 'READY') {
      // Job creation writes this same document inside its transaction. Claiming it
      // first prevents a new job from attaching while the object is being deleted.
      const claimed = await this.media.findOneAndUpdate({ _id: record._id, status: 'READY',
        $or: [{ expiresAt: { $lte: new Date() } }, { expiresAt: { $exists: false } }] },
        { $set: { cleanupClaimedAt: new Date() } }, { returnDocument: 'after' }).exec();
      if (!claimed) return false;
      return this.deleteObject(claimed, removeRecord);
    }
    return this.deleteObject(record, removeRecord);
  }

  /** Repairs legacy missing expiry and rechecks shared references in bounded batches. */
  async reconcileCommunityRetention(limit = 50): Promise<number> {
    const rows = await this.media.find({ purpose: 'community', status: 'READY', cleanupClaimedAt: { $exists: false },
      ...(this.communityRetentionCursor ? { _id: { $gt: this.communityRetentionCursor } } : {}) })
      .sort({ _id: 1 }).limit(limit).exec();
    if (!rows.length) { this.communityRetentionCursor = undefined; return 0; }
    for (const record of rows) {
      const referenced = await hasCommunityMediaReference(this.media, record._id as Types.ObjectId);
      if (referenced && !record.expiresAt) continue;
      if (!referenced && record.expiresAt) continue;
      // A concurrent attach/remove increments retentionVersion; do not overwrite its decision.
      const version = record.retentionVersion ?? 0;
      const filter = { _id: record._id, status: 'READY', cleanupClaimedAt: { $exists: false },
        ...(version ? { retentionVersion: version } : { $or: [{ retentionVersion: 0 }, { retentionVersion: { $exists: false } }] }) };
      if (referenced) {
        await this.media.updateOne(filter, { $unset: { expiresAt: 1 } }).exec();
      } else {
        const removed = await Promise.all(['community_posts', 'reviews'].map(collection =>
          this.media.db.collection(collection).findOne({ mediaIds: record._id, deletedAt: { $type: 'date' } },
            { projection: { deletedAt: 1 }, sort: { deletedAt: -1 } })));
        const lastDeleted = Math.max(0, ...removed.map(row => row?.deletedAt instanceof Date ? row.deletedAt.getTime() : 0));
        await this.media.updateOne(filter, { $set: { expiresAt: new Date((lastDeleted || Date.now()) + COMMUNITY_RETENTION_MS) } }).exec();
      }
    }
    this.communityRetentionCursor = rows.at(-1)!._id as Types.ObjectId;
    return rows.length;
  }

  async cleanupExpired(limit = 50): Promise<number> {
    const now = new Date();
    const pending = await this.media.find({ $or: [
      { status: { $in: ['PENDING', 'REJECTED', 'READY'] }, expiresAt: { $lte: now } },
      { status: 'FINALIZING', finalizeLeaseUntil: { $lte: now } },
    ] }).limit(limit).exec();
    for (const item of pending) await this.deleteMediaRecord(item);
    const deleted = await this.media.find({ status: 'DELETED', deletedAt: { $lte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) } }).limit(limit).exec();
    for (const item of deleted) await this.deleteObject(item, true);
    return pending.length + deleted.length;
  }

  private async deleteObject(record: HydratedDocument<MediaObject>, removeRecord = false): Promise<boolean> {
    try {
      await this.deleteFromBucket(record);
    } catch (error) {
      this.logger.warn(`R2 delete failed for ${record.key}: ${error instanceof Error ? error.message : 'unknown error'}`);
      if (record.status !== 'DELETED') {
        record.expiresAt = new Date(Date.now() + DELETE_FAILURE_BACKOFF_MS);
        if (record.status === 'FINALIZING') record.finalizeLeaseUntil = record.expiresAt;
        await record.save();
      }
      return false;
    }
    if (removeRecord) {
      await this.media.deleteOne({ _id: record._id }).exec();
      return true;
    }
    record.status = 'DELETED';
    record.deletedAt = new Date();
    record.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await record.save();
    return true;
  }

  private async deleteFromBucket(record: HydratedDocument<MediaObject>): Promise<void> {
    const bucket = record.status === 'PENDING' || record.status === 'REJECTED' || record.status === 'FINALIZING'
      ? this.privateBucket() : record.visibility === 'PUBLIC' ? AppConfig.require('R2_BUCKET') : this.privateBucket();
    await this.deleteKey(bucket, record.key);
    if (record.status === 'FINALIZING' && record.visibility === 'PUBLIC') {
      await this.deleteKey(AppConfig.require('R2_BUCKET'), record.key);
    }
    if (record.staleBucket && record.staleBucket !== record.visibility) {
      await this.deleteKey(record.staleBucket === 'PUBLIC' ? AppConfig.require('R2_BUCKET') : this.privateBucket(),
        record.key);
    }
    if (record.pendingBucket && record.pendingBucket !== record.visibility) {
      await this.deleteKey(record.pendingBucket === 'PUBLIC' ? AppConfig.require('R2_BUCKET') : this.privateBucket(),
        record.key);
    }
  }

  private async deleteKey(bucket: string, key: string): Promise<void> {
    const client = this.client();
    for (let attempt = 1; ; attempt += 1) {
      try {
        await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
        return;
      } catch (error) {
        if (isMissingObjectError(error)) return;
        if (attempt >= DELETE_MAX_ATTEMPTS || !isTransientStorageError(error)) throw error;
        await new Promise((resolve) => setTimeout(resolve, DELETE_RETRY_BASE_MS * 2 ** (attempt - 1)));
      }
    }
  }

  private mediaResponse(record: HydratedDocument<MediaObject>) {
    return {
      id: String(record._id),
      purpose: record.purpose,
      visibility: record.visibility,
      status: 'ACTIVE',
      contentType: record.contentType,
      sizeBytes: record.sizeBytes,
      url: record.visibility === 'PUBLIC' ? this.publicUrl(record.key) : null,
      expiresAt: record.expiresAt ?? null,
    };
  }

  publicUrl(key: string): string | null {
    if (!PUBLIC_PURPOSES.has(key.split('/')[0])) return null;
    const base = AppConfig.optional('R2_PUBLIC_BASE_URL')?.replace(/\/$/, '');
    return base ? `${base}/${key}` : null;
  }

  private async signedPutUrl(key: string, contentType: string, sizeBytes: number) {
    const client = this.client();
    const command = new PutObjectCommand({ Bucket: this.privateBucket(), Key: key,
      ContentType: contentType, ContentLength: sizeBytes, IfNoneMatch: '*' });
    return getSignedUrl(client, command, { expiresIn: 300,
      signableHeaders: new Set(['content-type', 'content-length', 'if-none-match']) });
  }

  private uploadMaxBytes(): number {
    const configured = Number(AppConfig.optional('R2_UPLOAD_MAX_BYTES') ?? '5242880');
    if (!Number.isSafeInteger(configured) || configured < 1 || configured > HARD_UPLOAD_MAX_BYTES) {
      throw new ServiceUnavailableException(`R2_UPLOAD_MAX_BYTES must be between 1 and ${HARD_UPLOAD_MAX_BYTES}`);
    }
    return configured;
  }

  private async headObject(key: string) {
    const client = this.client();
    return client.send(new HeadObjectCommand({ Bucket: this.privateBucket(), Key: key }));
  }

  private unifiedBucket(): boolean {
    return AppConfig.require('R2_PRIVATE_BUCKET') === AppConfig.require('R2_BUCKET');
  }

  private privateBucket(): string {
    return AppConfig.require('R2_PRIVATE_BUCKET');
  }

  private client() {
    const account = AppConfig.require('R2_ACCOUNT_ID');
    return new S3Client({
      region: 'auto',
      endpoint: `https://${account}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: AppConfig.require('R2_ACCESS_KEY_ID'),
        secretAccessKey: AppConfig.require('R2_SECRET_ACCESS_KEY'),
      },
    });
  }
}
