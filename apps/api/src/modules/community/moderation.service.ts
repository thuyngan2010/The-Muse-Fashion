import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Model, Types, type ClientSession, type Connection } from 'mongoose';
import { withCommerceTransaction } from '../../common/mongo-transaction.util.js';
import type { ModerationWriteDto } from './community.dto.js';
import { Comment, CommunityPost, ModerationLog, Review } from './community.schemas.js';

@Injectable()
export class ModerationService {
  constructor(
    @InjectModel(Review.name) private readonly reviews: Model<Review>,
    @InjectModel(CommunityPost.name) private readonly posts: Model<CommunityPost>,
    @InjectModel(Comment.name) private readonly comments: Model<Comment>,
    @InjectModel(ModerationLog.name) private readonly logs: Model<ModerationLog>,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  async moderate(actorId: string, targetId: string, dto: ModerationWriteDto) {
    if (!Types.ObjectId.isValid(targetId)) throw new NotFoundException('Content not found');
    return withCommerceTransaction(this.connection, async (session) => {
      if (dto.targetType === 'REVIEW') return this.moderateReview(actorId, targetId, dto, session);
      if (dto.targetType === 'POST') return this.moderatePost(actorId, targetId, dto, session);
      return this.moderateComment(actorId, targetId, dto, session);
    });
  }

  async queue(page = 1, limit = 20, status?: string, targetType?: string) {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(50, Math.max(1, limit));
    const pipeline = (type: string, field: string): Array<import('mongoose').PipelineStage.Match | import('mongoose').PipelineStage.Project> => [
      { $match: { deletedAt: null, ...(status ? { status } : {}) } },
      { $project: { id: { $toString: '$_id' }, authorId: { $toString: type === 'REVIEW' ? '$customerId' : '$authorId' },
        targetType: { $literal: type }, content: `$${field}`, status: 1, createdAt: 1 } },
    ];
    const rows = await this.reviews.aggregate<{ items: unknown[]; count: Array<{ total: number }> }>([
      ...pipeline('REVIEW', 'content'),
      { $unionWith: { coll: 'community_posts', pipeline: pipeline('POST', 'caption') } },
      { $unionWith: { coll: 'comments', pipeline: pipeline('COMMENT', 'body') } },
      ...(targetType ? [{ $match: { targetType } }] : []),
      { $facet: { items: [{ $sort: { createdAt: -1, _id: -1, targetType: 1 } },
        { $skip: (safePage - 1) * safeLimit }, { $limit: safeLimit }], count: [{ $count: 'total' }] } },
    ]).exec();
    return { page: safePage, limit: safeLimit, total: rows[0]?.count[0]?.total ?? 0, items: rows[0]?.items ?? [] };
  }

  private async moderateReview(actorId: string, targetId: string, dto: ModerationWriteDto, session: ClientSession) {
    const review = await this.reviews.findById(targetId).session(session).exec();
    if (!review || review.deletedAt) throw new NotFoundException('Content not found');
    review.status = dto.action === 'HIDE' ? 'HIDDEN' : 'PUBLIC';
    await review.save({ session });
    return this.writeLog(actorId, dto, targetId, session);
  }

  private async moderatePost(actorId: string, targetId: string, dto: ModerationWriteDto, session: ClientSession) {
    const post = await this.posts.findById(targetId).session(session).exec();
    if (!post || post.deletedAt) throw new NotFoundException('Content not found');
    if (dto.action === 'HIDE') {
      post.status = 'HIDDEN';
      post.moderationLocked = true;
    } else {
      post.status = 'PUBLIC';
      post.moderationLocked = false;
    }
    await post.save({ session });
    return this.writeLog(actorId, dto, targetId, session);
  }

  private async moderateComment(actorId: string, targetId: string, dto: ModerationWriteDto, session: ClientSession) {
    const comment = await this.comments.findById(targetId).session(session).exec();
    if (!comment || comment.deletedAt) throw new NotFoundException('Content not found');
    comment.status = dto.action === 'HIDE' ? 'HIDDEN' : 'PUBLIC';
    await comment.save({ session });
    return this.writeLog(actorId, dto, targetId, session);
  }

  private async writeLog(actorId: string, dto: ModerationWriteDto, targetId: string, session: ClientSession) {
    const [created] = await this.logs.create([{
      targetType: dto.targetType,
      targetId,
      action: dto.action,
      actorId,
      reason: dto.reason.trim(),
    }], { session });
    return {
      id: String(created._id),
      targetType: created.targetType,
      targetId: created.targetId,
      action: created.action,
      reason: created.reason,
      actorId: String(created.actorId),
      createdAt: (created as { createdAt?: Date }).createdAt?.toISOString(),
    };
  }
}
