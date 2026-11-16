import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes } from 'mongoose';

@Schema({ timestamps: true, collection: 'media_objects' })
export class MediaObject {
  @Prop({ type: String, required: true, unique: true }) key!: string;
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true }) ownerId!: string;
  @Prop({ type: String, required: true }) purpose!: string;
  @Prop({ type: String, enum: ['PUBLIC', 'PRIVATE'], required: true }) visibility!: string;
  @Prop({ type: String, enum: ['PENDING', 'FINALIZING', 'READY', 'REJECTED', 'DELETED'], default: 'PENDING', index: true }) status!: string;
  @Prop({ type: String, enum: ['image/jpeg', 'image/png', 'image/webp'] }) contentType?: string;
  @Prop({ type: Number, min: 1 }) sizeBytes?: number;
  @Prop({ type: Number, min: 1 }) expectedSizeBytes?: number;
  @Prop({ type: Date, index: true }) expiresAt?: Date;
  @Prop({ type: Date }) cleanupClaimedAt?: Date;
  @Prop({ type: Number, default: 0 }) retentionVersion!: number;
  @Prop({ type: Date }) finalizeLeaseUntil?: Date;
  @Prop({ type: String, enum: ['PUBLIC', 'PRIVATE'] }) staleBucket?: string;
  @Prop({ type: String, enum: ['PUBLIC', 'PRIVATE'] }) pendingBucket?: string;
  @Prop({ type: String }) publicationLeaseId?: string;
  @Prop({ type: Date }) publicationLeaseUntil?: Date;
  @Prop({ type: Date }) deletedAt?: Date;
}
export const MediaObjectSchema = SchemaFactory.createForClass(MediaObject);
