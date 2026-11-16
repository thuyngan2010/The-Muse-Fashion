import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { EmailDispatchService } from '../mail/email-dispatch.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { UsersService } from '../users/users.service.js';
import { OutboxEvent } from './outbox-event.schema.js';
import { Comment, CommunityPost } from '../community/community.schemas.js';
import { Lookbook } from '../lookbooks/lookbook.schema.js';

const RETRY_MS = [10_000, 30_000, 120_000, 600_000, 3_600_000];
const LOOKBOOK_FANOUT_LIMIT = 100;

@Injectable()
export class OutboxProcessorService {
  private readonly logger = new Logger(OutboxProcessorService.name);

  constructor(
    @InjectModel(OutboxEvent.name) private readonly outbox: Model<OutboxEvent>,
    @InjectModel(CommunityPost.name) private readonly posts: Model<CommunityPost>,
    @InjectModel(Comment.name) private readonly comments: Model<Comment>,
    @InjectModel(Lookbook.name) private readonly lookbooks: Model<Lookbook>,
    private readonly notifications: NotificationsService,
    private readonly email: EmailDispatchService,
    private readonly users: UsersService,
  ) {}

  async processDue(limit = 20): Promise<number> {
    const now = new Date();
    await this.outbox.updateMany({ status: 'PROCESSING', attempts: { $gte: 10 }, leaseUntil: { $lte: now } },
      { $set: { status: 'DEAD' }, $unset: { leaseUntil: 1, leaseId: 1 } }).exec();
    const due = await this.outbox.find({
      attempts: { $lt: 10 },
      $or: [
        { status: { $in: ['PENDING', 'FAILED'] }, $or: [{ nextAttemptAt: null }, { nextAttemptAt: { $lte: now } }] },
        { status: 'PROCESSING', leaseUntil: { $lte: now } },
      ],
    }).sort({ occurredAt: 1 }).limit(limit).exec();

    for (const event of due) {
      const leaseId = randomUUID();
      const claimed = await this.outbox.findOneAndUpdate(
        { eventId: event.eventId, attempts: { $lt: 10 }, $or: [
          { status: { $in: ['PENDING', 'FAILED'] }, $or: [{ nextAttemptAt: null }, { nextAttemptAt: { $lte: now } }] },
          { status: 'PROCESSING', leaseUntil: { $lte: now } },
        ] },
        { $set: { status: 'PROCESSING', leaseUntil: new Date(Date.now() + 10 * 60_000), leaseId }, $inc: { attempts: 1 } },
        { new: true },
      ).exec();
      if (!claimed) continue;

      try {
        await this.dispatch(claimed.type, claimed.eventId, claimed.payload ?? {});
        await this.outbox.updateOne(
          { eventId: claimed.eventId, leaseId },
          { $set: { status: 'PUBLISHED' }, $unset: { nextAttemptAt: 1, leaseUntil: 1, leaseId: 1 } },
        ).exec();
      } catch (error) {
        const attempts = claimed.attempts;
        const delay = RETRY_MS[Math.min(attempts - 1, RETRY_MS.length - 1)];
        await this.outbox.updateOne(
          { eventId: claimed.eventId, leaseId },
          {
            $set: {
              status: attempts >= 10 ? 'DEAD' : 'PENDING',
              nextAttemptAt: attempts >= 10 ? undefined : new Date(Date.now() + delay),
            },
            $unset: { leaseUntil: 1, leaseId: 1 },
          },
        ).exec();
        this.logger.warn(`Outbox ${claimed.eventId} failed: ${error instanceof Error ? error.message : 'unknown'}`);
      }
    }

    return due.length;
  }

  private async dispatch(type: string, eventId: string, payload: Record<string, unknown>): Promise<void> {
    if (type === 'post.commented') {
      await this.handlePostCommented(eventId, payload);
      return;
    }
    if (type === 'lookbook.published') {
      await this.handleLookbookPublished(eventId, payload);
      return;
    }
    if (type === 'ai.job.completed') {
      const ownerId = String(payload.ownerId ?? '');
      if (ownerId) await this.notifications.createIdempotent({ ownerId, type,
        title: 'Ảnh AI đã sẵn sàng', body: 'Kết quả tạo ảnh của bạn đã hoàn tất.',
        reference: { jobId: payload.jobId, eventId }, dedupKey: `notification:${eventId}` });
      return;
    }

    const customerId = payload.customerId ? String(payload.customerId) : undefined;
    if (!customerId) return;

    const user = await this.users.findById(customerId);
    if (!user?.email) return;

    const orderId = payload.orderId ? String(payload.orderId) : undefined;
    const code = payload.code ? String(payload.code) : undefined;

    if (type === 'order.created') {
      const title = 'Đơn hàng đã được tạo';
      const body = `Đơn ${code ?? orderId ?? ''} đang chờ thanh toán.`;
      await this.notifications.createIdempotent({
        ownerId: customerId,
        type: 'order.created',
        title,
        body,
        reference: { orderId, eventId },
        dedupKey: `notification:${eventId}`,
      });
      await this.email.enqueue(
        'order.created',
        user.email,
        `order.created:${orderId ?? eventId}`,
        { code, orderId, payableTotal: payload.payableTotal, paymentDueAt: payload.paymentDueAt },
      );
      return;
    }

    if (type === 'order.status_changed') {
      const to = String(payload.to ?? '');
      const title = 'Cập nhật đơn hàng';
      const body = `Đơn ${code ?? orderId ?? ''} chuyển sang trạng thái ${to}.`;
      await this.notifications.createIdempotent({
        ownerId: customerId,
        type: 'order.status_changed',
        title,
        body,
        reference: { orderId, to, eventId },
        dedupKey: `notification:${eventId}`,
      });
      await this.email.enqueue(
        'order.status_changed',
        user.email,
        `order.status:${orderId ?? eventId}:${to}`,
        { code, orderId, from: payload.from, to },
      );
      return;
    }

    if (type === 'payment.verified' || type === 'payment.succeeded') {
      const title = 'Thanh toán thành công';
      const body = `Đơn ${code ?? orderId ?? ''} đã được thanh toán.`;
      await this.notifications.createIdempotent({
        ownerId: customerId,
        type: 'payment.verified',
        title,
        body,
        reference: { orderId, eventId },
        dedupKey: `notification:${eventId}`,
      });
      await this.email.enqueue(
        'payment.succeeded',
        user.email,
        `payment.succeeded:${payload.paymentAttemptId ?? eventId}`,
        { orderId, amount: payload.amount },
      );
      return;
    }

    if (type === 'refund.completed') {
      const title = 'Hoàn tiền thành công';
      const body = `Khoản hoàn ${payload.amount} VND cho đơn ${orderId ?? ''} đã được ghi nhận.`;
      await this.notifications.createIdempotent({
        ownerId: customerId,
        type: 'refund.completed',
        title,
        body,
        reference: { orderId, refundId: payload.refundId, eventId },
        dedupKey: `notification:${eventId}`,
      });
      await this.email.enqueue(
        'refund.succeeded',
        user.email,
        `refund.completed:${payload.refundId ?? eventId}`,
        { orderId, amount: payload.amount, bankReference: payload.bankReference },
      );
    }
  }

  private async handlePostCommented(eventId: string, payload: Record<string, unknown>): Promise<void> {
    const ownerId = String(payload.postAuthorId ?? payload.customerId ?? '');
    if (!ownerId) return;
    const postId = payload.postId ? String(payload.postId) : undefined;
    const commentId = payload.commentId ? String(payload.commentId) : undefined;
    if (!postId || !commentId || !Types.ObjectId.isValid(postId) || !Types.ObjectId.isValid(commentId)) return;
    const [post, comment] = await Promise.all([
      this.posts.findOne({ _id: postId, status: 'PUBLIC', deletedAt: null }).select('_id authorId').lean().exec(),
      this.comments.findOne({ _id: commentId, postId, status: 'PUBLIC', deletedAt: null }).select('_id').lean().exec(),
    ]);
    if (!post || !comment || String(post.authorId) !== ownerId) return;
    await this.notifications.createIdempotent({
      ownerId,
      type: 'post.commented',
      title: 'Bình luận mới',
      body: 'Có bình luận mới trên bài viết của bạn.',
      reference: { postId, commentId, eventId },
      dedupKey: `notification:${eventId}`,
    });
  }

  private async handleLookbookPublished(eventId: string, payload: Record<string, unknown>): Promise<void> {
    const lookbookId = payload.lookbookId ? String(payload.lookbookId) : undefined;
    if (!lookbookId || !Types.ObjectId.isValid(lookbookId)) return;
    const version = Number(payload.version);
    let afterId: string | undefined;
    while (true) {
      const lookbook = await this.lookbooks.findOne({ _id: lookbookId, status: 'PUBLISHED' }).select('title').lean().exec();
      if (!lookbook) break;
      const title = lookbook.title || 'Lookbook mới';
      const recipients = await this.users.listActiveCustomerIds(LOOKBOOK_FANOUT_LIMIT, afterId);
      if (!recipients.length) break;
      await Promise.all(recipients.map((recipient) => this.notifications.createIdempotent({
        ownerId: String(recipient._id),
        type: 'lookbook.published',
        title: 'Bộ sưu tập mới',
        body: `Lookbook "${title}" vừa được công bố.`,
        reference: { lookbookId, eventId, version: payload.version },
        dedupKey: `notification:lookbook.published:${lookbookId}:${Number.isFinite(version) ? version : eventId}:${String(recipient._id)}`,
      })));
      afterId = String(recipients[recipients.length - 1]._id);
      if (recipients.length < LOOKBOOK_FANOUT_LIMIT) break;
    }
  }
}
