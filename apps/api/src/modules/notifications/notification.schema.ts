import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes } from 'mongoose';

@Schema({ timestamps: true, collection: 'notifications' })
export class Notification {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true }) ownerId!: string;
  @Prop({ type: String, required: true }) type!: string;
  @Prop({ type: String, required: true }) title!: string;
  @Prop({ type: String, required: true }) body!: string;
  @Prop({ type: Object, required: true }) reference!: Record<string, unknown>;
  @Prop({ type: Date }) readAt?: Date;
  @Prop({ type: String, required: true, unique: true }) dedupKey!: string;
}
export const NotificationSchema = SchemaFactory.createForClass(Notification);
NotificationSchema.index({ ownerId: 1, createdAt: -1 });
NotificationSchema.index({ ownerId: 1, readAt: 1 });
