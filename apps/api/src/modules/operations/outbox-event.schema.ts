import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ timestamps: true, collection: 'outbox_events' })
export class OutboxEvent {
  @Prop({ type: String, required: true, unique: true }) eventId: string;
  @Prop({ type: String, required: true, index: true }) type: string;
  @Prop({ type: String, index: true }) eventType?: string;
  @Prop({ type: Number, default: 1 }) eventVersion?: number;
  @Prop({ type: String }) correlationId?: string;
  @Prop({ type: String }) producer?: string;
  @Prop({ type: Number }) aggregateVersion?: number;
  @Prop({ type: Object }) data?: Record<string, unknown>;
  @Prop({ type: Date, required: true }) occurredAt: Date;
  @Prop({ type: String, required: true }) aggregateType: string;
  @Prop({ type: String, required: true }) aggregateId: string;
  @Prop({ type: Object, required: true }) payload: Record<string, unknown>;
  @Prop({ type: String, enum: ['PENDING', 'PROCESSING', 'PUBLISHED', 'FAILED', 'DEAD'], default: 'PENDING', index: true }) status: string;
  @Prop({ type: Number, default: 0 }) attempts: number;
  @Prop({ type: Date, index: true }) nextAttemptAt?: Date;
  @Prop({ type: Date }) leaseUntil?: Date;
  @Prop({ type: String }) leaseId?: string;
}
export type OutboxEventDocument = HydratedDocument<OutboxEvent>;
export const OutboxEventSchema = SchemaFactory.createForClass(OutboxEvent);
OutboxEventSchema.pre('validate', function () {
  this.eventType ??= this.type;
  this.eventVersion ??= 1;
  this.correlationId ??= this.eventId;
  this.producer ??= this.aggregateType;
  this.aggregateVersion ??= typeof this.payload?.version === 'number' ? this.payload.version : 1;
  this.data ??= this.payload;
});
OutboxEventSchema.index({ status: 1, nextAttemptAt: 1 });
