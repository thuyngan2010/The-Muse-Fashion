import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes } from 'mongoose';

@Schema({ timestamps: true, collection: 'reviews' })
export class Review {
  @Prop({ type: SchemaTypes.ObjectId, required: true }) orderItemId!: string;
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true }) orderId!: string;
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true }) productId!: string;
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true }) customerId!: string;
  @Prop({ type: Number, required: true, min: 1, max: 5 }) stars!: number;
  @Prop({ type: String, maxlength: 5000 }) content!: string;
  @Prop({ type: [SchemaTypes.ObjectId], default: [] }) mediaIds!: string[];
  @Prop({ type: String, enum: ['PUBLIC', 'HIDDEN', 'PENDING_REVIEW'], default: 'PENDING_REVIEW', index: true }) status!: string;
  @Prop({ type: Date }) deletedAt?: Date;
}
export const ReviewSchema = SchemaFactory.createForClass(Review);
ReviewSchema.index({ orderItemId: 1, customerId: 1 }, { unique: true });

@Schema({ timestamps: true, collection: 'community_posts' })
export class CommunityPost {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true }) authorId!: string;
  @Prop({ type: String, maxlength: 5000 }) caption!: string;
  @Prop({ type: [SchemaTypes.ObjectId], default: [] }) mediaIds!: string[];
  @Prop({ type: String, enum: ['PUBLIC', 'HIDDEN', 'PENDING_REVIEW'], default: 'PUBLIC', index: true }) status!: string;
  @Prop({ type: Boolean, default: false }) moderationLocked!: boolean;
  @Prop({ type: Date }) deletedAt?: Date;
}
export const CommunityPostSchema = SchemaFactory.createForClass(CommunityPost);
CommunityPostSchema.index({ status: 1, createdAt: -1 });
CommunityPostSchema.index({ caption: 'text' });

@Schema({ timestamps: true, collection: 'comments' })
export class Comment {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true }) postId!: string;
  @Prop({ type: SchemaTypes.ObjectId, required: true }) authorId!: string;
  @Prop({ type: SchemaTypes.ObjectId }) parentId?: string;
  @Prop({ type: String, enum: ['PUBLIC', 'HIDDEN'], default: 'PUBLIC' }) status!: string;
  @Prop({ type: String, required: true, maxlength: 2000 }) body!: string;
  @Prop({ type: Date }) deletedAt?: Date;
}
export const CommentSchema = SchemaFactory.createForClass(Comment);
CommentSchema.index({ postId: 1, createdAt: 1 });

@Schema({ timestamps: true, collection: 'moderation_logs' })
export class ModerationLog {
  @Prop({ type: String, required: true }) targetType!: string;
  @Prop({ type: String, required: true }) targetId!: string;
  @Prop({ type: String, required: true }) action!: string;
  @Prop({ type: SchemaTypes.ObjectId, required: true }) actorId!: string;
  @Prop({ type: String, required: true }) reason!: string;
}
export const ModerationLogSchema = SchemaFactory.createForClass(ModerationLog);
