import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Model, Types, type Connection } from 'mongoose';
import { withCommerceTransaction } from '../../common/mongo-transaction.util.js';
import { randomUUID } from 'node:crypto';
import { AiJob } from '../ai/ai.schemas.js';
import { MediaObject } from '../storage/media-object.schema.js';
import { StorageService } from '../storage/storage.service.js';
import { OutboxEvent } from '../operations/outbox-event.schema.js';
import type { CommentWriteDto, PostWriteDto } from './community.dto.js';
import { assertSafeCommunityText } from './community-text.util.js';
import { Comment, CommunityPost } from './community.schemas.js';
import { releaseCommunityMedia, retainCommunityMedia } from './community-media-retention.util.js';

@Injectable()
export class CommunityPostService {
  constructor(
    @InjectModel(CommunityPost.name) private readonly posts: Model<CommunityPost>,
    @InjectModel(Comment.name) private readonly comments: Model<Comment>,
    @InjectModel(MediaObject.name) private readonly media: Model<MediaObject>,
    @InjectModel(AiJob.name) private readonly aiJobs: Model<AiJob>,
    @InjectModel(OutboxEvent.name) private readonly outbox: Model<OutboxEvent>,
    private readonly storage: StorageService,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  async listPublic(q?: string, page = 1, limit = 20) {
    if (q !== undefined && typeof q !== 'string') throw new BadRequestException('q must be a single string');
    const safeLimit = Math.min(50, Math.max(1, limit));
    const safePage = Math.max(1, page);
    const skip = (safePage - 1) * safeLimit;
    const filter: Record<string, unknown> = { status: 'PUBLIC', deletedAt: null };
    if (q?.trim()) {
      filter.$text = { $search: q.trim() };
    }
    const [items, total] = await Promise.all([
      this.posts.find(filter).sort({ createdAt: -1 }).skip(skip).limit(safeLimit).lean().exec(),
      this.posts.countDocuments(filter).exec(),
    ]);
    return {
      page: safePage,
      limit: safeLimit,
      total,
      items: await Promise.all(items.map((item) => this.serializePost(item as unknown as Record<string, unknown>))),
    };
  }

  async getPublic(postId: string) {
    if (!Types.ObjectId.isValid(postId)) throw new NotFoundException('Post not found');
    const post = await this.posts.findOne({ _id: postId, status: 'PUBLIC', deletedAt: null }).lean().exec();
    if (!post) throw new NotFoundException('Post not found');
    return this.serializePost(post as unknown as Record<string, unknown>);
  }

  async create(authorId: string, dto: PostWriteDto) {
    const caption = assertSafeCommunityText('caption', dto.caption);
    const created = await withCommerceTransaction(this.connection, async (session) => {
      const mediaIds = await this.validatePostMedia(authorId, dto.mediaIds);
      await retainCommunityMedia(this.media, mediaIds, session);
      const [post] = await this.posts.create([{ authorId, caption, mediaIds, status: 'PUBLIC' }], { session });
      return post;
    });
    return this.serializePost(created.toObject() as unknown as Record<string, unknown>);
  }

  async update(authorId: string, postId: string, dto: PostWriteDto) {
    if (!Types.ObjectId.isValid(postId)) throw new NotFoundException('Post not found');
    const caption = assertSafeCommunityText('caption', dto.caption);
    const post = await withCommerceTransaction(this.connection, async (session) => {
      const current = await this.posts.findById(postId).session(session).exec();
      if (!current || current.deletedAt) throw new NotFoundException('Post not found');
      if (String(current.authorId) !== authorId) throw new ForbiddenException('Cannot modify another user post');
      if (current.moderationLocked) throw new BadRequestException('Post is locked by moderation');
      const mediaIds = await this.validatePostMedia(authorId, dto.mediaIds);
      await retainCommunityMedia(this.media, mediaIds, session);
      const previousIds = current.mediaIds.map(String);
      current.caption = caption;
      current.mediaIds = mediaIds;
      await current.save({ session });
      await releaseCommunityMedia(this.media, previousIds.filter(id => !mediaIds.includes(id)), session);
      return current;
    });
    return this.serializePost(post.toObject() as unknown as Record<string, unknown>);
  }

  async delete(authorId: string, postId: string): Promise<void> {
    if (!Types.ObjectId.isValid(postId)) throw new NotFoundException('Post not found');
    await withCommerceTransaction(this.connection, async (session) => {
      const post = await this.posts.findById(postId).session(session).exec();
      if (!post || post.deletedAt) throw new NotFoundException('Post not found');
      if (String(post.authorId) !== authorId) throw new ForbiddenException('Cannot modify another user post');
      post.status = 'HIDDEN';
      post.deletedAt = new Date();
      await post.save({ session });
      await this.comments.updateMany({ postId }, { $set: { status: 'HIDDEN', deletedAt: new Date() } }, { session }).exec();
      await releaseCommunityMedia(this.media, post.mediaIds.map(String), session);
    });
  }

  async listComments(postId: string) {
    if (!Types.ObjectId.isValid(postId)) throw new NotFoundException('Post not found');
    const post = await this.posts.findOne({ _id: postId, status: 'PUBLIC', deletedAt: null }).lean().exec();
    if (!post) throw new NotFoundException('Post not found');
    const items = await this.comments.find({ postId, status: 'PUBLIC', deletedAt: null }).sort({ createdAt: 1 }).lean().exec();
    return { items: items.map((item) => this.serializeComment(item as unknown as Record<string, unknown>)) };
  }

  async createComment(authorId: string, postId: string, dto: CommentWriteDto) {
    if (!Types.ObjectId.isValid(postId)) throw new NotFoundException('Post not found');
    const post = await this.posts.findById(postId).exec();
    if (!post || post.deletedAt || post.status !== 'PUBLIC') {
      throw new BadRequestException('Comments are closed for this post');
    }
    const body = assertSafeCommunityText('body', dto.body);
    if (dto.parentId) {
      const parent = await this.comments.findOne({ _id: dto.parentId, postId, status: 'PUBLIC', deletedAt: null }).lean().exec();
      if (!parent) throw new BadRequestException('Parent comment is unavailable');
    }

    const created = await withCommerceTransaction(this.connection, async (session) => {
      const [comment] = await this.comments.create([{
        postId, authorId, parentId: dto.parentId, body, status: 'PUBLIC',
      }], { session });
      if (String(post.authorId) !== authorId) {
        await this.outbox.create([{
          eventId: randomUUID(), type: 'post.commented', occurredAt: new Date(),
          aggregateType: 'comment', aggregateId: String(comment._id),
          payload: { commentId: String(comment._id), postId, postAuthorId: String(post.authorId),
            customerId: String(post.authorId), authorId },
        }], { session });
      }
      return comment;
    });

    return this.serializeComment(created.toObject() as unknown as Record<string, unknown>);
  }

  async updateComment(authorId: string, postId: string, commentId: string, dto: CommentWriteDto) {
    if (!Types.ObjectId.isValid(postId) || !Types.ObjectId.isValid(commentId)) {
      throw new NotFoundException('Comment not found');
    }
    const comment = await this.comments.findOne({ _id: commentId, postId }).exec();
    if (!comment || comment.deletedAt) throw new NotFoundException('Comment not found');
    if (String(comment.authorId) !== authorId) throw new ForbiddenException('Cannot modify another user comment');
    comment.body = assertSafeCommunityText('body', dto.body);
    await comment.save();
    return this.serializeComment(comment.toObject() as unknown as Record<string, unknown>);
  }

  async deleteComment(authorId: string, postId: string, commentId: string): Promise<void> {
    if (!Types.ObjectId.isValid(postId) || !Types.ObjectId.isValid(commentId)) {
      throw new NotFoundException('Comment not found');
    }
    const comment = await this.comments.findOne({ _id: commentId, postId }).exec();
    if (!comment || comment.deletedAt) throw new NotFoundException('Comment not found');
    if (String(comment.authorId) !== authorId) throw new ForbiddenException('Cannot modify another user comment');
    comment.status = 'HIDDEN';
    comment.deletedAt = new Date();
    await comment.save();
  }

  private async validatePostMedia(authorId: string, mediaIds: string[]) {
    const records = await this.media.find({ _id: { $in: mediaIds } }).lean().exec();
    if (records.length !== mediaIds.length) throw new BadRequestException('One or more images are unavailable');
    for (const record of records) {
      if (record.status !== 'READY') throw new BadRequestException('One or more images are unavailable');
      const owned = String(record.ownerId) === authorId;
      const aiOwned = await this.isAiOutputOwnedByUser(authorId, record.key);
      if (!owned && !aiOwned) throw new ForbiddenException('Image ownership mismatch');
      if (!['community', 'tryon'].includes(record.purpose)) {
        throw new BadRequestException('Invalid image purpose');
      }
    }
    return mediaIds;
  }

  private async isAiOutputOwnedByUser(userId: string, key: string) {
    const job = await this.aiJobs.findOne({ ownerId: userId, outputKeys: key, state: 'COMPLETED' }).lean().exec();
    return Boolean(job);
  }

  private async serializePost(post: Record<string, unknown>) {
    const mediaIds = (post.mediaIds as string[] | undefined) ?? [];
    const media = mediaIds.length ? await this.media.find({ _id: { $in: mediaIds } }).lean().exec() : [];
    return {
      id: String(post._id),
      authorId: String(post.authorId),
      caption: post.caption,
      mediaIds,
      imageUrls: await Promise.all(media.map(async (item) => {
        if (item.visibility === 'PUBLIC') return this.storage.publicUrl(item.key);
        return this.storage.signedReadUrl(item.key);
      })),
      status: post.status,
      createdAt: (post.createdAt as Date | undefined)?.toISOString(),
    };
  }

  private serializeComment(comment: Record<string, unknown>) {
    return {
      id: String(comment._id),
      postId: String(comment.postId),
      authorId: String(comment.authorId),
      parentId: comment.parentId ? String(comment.parentId) : null,
      body: comment.body,
      status: comment.status,
      createdAt: (comment.createdAt as Date | undefined)?.toISOString(),
    };
  }
}
