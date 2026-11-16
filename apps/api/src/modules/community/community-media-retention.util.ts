import { BadRequestException } from '@nestjs/common';
import { Model, Types, type ClientSession } from 'mongoose';
import { MediaObject } from '../storage/media-object.schema.js';

export const COMMUNITY_RETENTION_MS = 30 * 24 * 60 * 60_000;

/** The media write serializes attachment/removal with the cleanup claim. */
export async function retainCommunityMedia(media: Model<MediaObject>, ids: string[], session: ClientSession): Promise<void> {
  for (const id of [...new Set(ids.map(String))]) {
    const updated = await media.updateOne({ _id: id, status: 'READY', cleanupClaimedAt: { $exists: false },
      $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: new Date() } }] },
    { $inc: { retentionVersion: 1 } }, { session }).exec();
    if (updated.matchedCount !== 1) throw new BadRequestException('One or more images are unavailable');
    await media.updateOne({ _id: id, purpose: 'community' }, { $unset: { expiresAt: 1 } }, { session }).exec();
  }
}

export async function hasCommunityMediaReference(media: Model<MediaObject>, id: Types.ObjectId, session?: ClientSession): Promise<boolean> {
  // Hidden/pending content remains a reference: moderation may restore it later.
  for (const collection of ['community_posts', 'reviews']) {
    const reference = await media.db.collection(collection).findOne({ mediaIds: id, deletedAt: null },
      { projection: { _id: 1 }, ...(session ? { session } : {}) });
    if (reference) return true;
  }
  return false;
}

export async function releaseCommunityMedia(media: Model<MediaObject>, ids: string[], session: ClientSession): Promise<void> {
  for (const id of [...new Set(ids.map(String))]) {
    const record = await media.findOneAndUpdate({ _id: id, purpose: 'community', status: 'READY',
      cleanupClaimedAt: { $exists: false } }, { $inc: { retentionVersion: 1 } }, { session, returnDocument: 'after' }).exec();
    if (!record) continue; // AI media keeps its separate retention policy.
    const referenced = await hasCommunityMediaReference(media, record._id as Types.ObjectId, session);
    await media.updateOne({ _id: record._id }, referenced
      ? { $unset: { expiresAt: 1 } }
      : { $set: { expiresAt: new Date(Date.now() + COMMUNITY_RETENTION_MS) } }, { session }).exec();
  }
}
