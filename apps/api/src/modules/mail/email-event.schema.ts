import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ timestamps: true, collection: 'email_events' })
export class EmailEvent {
  @Prop({ type: String, required: true, unique: true }) dedupKey: string;
  @Prop({ type: String, required: true }) to: string;
  @Prop({ type: String, required: true }) template: string;
  @Prop({ type: String, enum: ['PENDING', 'SENDING', 'SENT', 'FAILED', 'PERMANENT_FAILURE'], default: 'PENDING', index: true }) state: string;
  @Prop({ type: Number, min: 0, default: 0 }) attempts: number;
  @Prop({ type: String }) providerId?: string;
  @Prop({ type: Date }) nextAttemptAt?: Date;
  @Prop({ type: Date }) leaseUntil?: Date;
  @Prop({ type: String }) leaseId?: string;
  @Prop({ type: Object, default: {} }) payload: Record<string, unknown>;
  @Prop({ type: Date }) expiresAt?: Date;
  @Prop({ type: String }) lastError?: string;
}
export const EmailEventSchema = SchemaFactory.createForClass(EmailEvent);
EmailEventSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
