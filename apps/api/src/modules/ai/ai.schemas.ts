import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes } from 'mongoose';
import type { FashionRenderPlan } from './fashion-plan.js';

@Schema({ timestamps: true, collection: 'ai_jobs' })
export class AiJob {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true }) ownerId!: string;
  @Prop({ type: String, enum: ['TRY_ON', 'MIX_MATCH'], required: true }) type!: string;
  @Prop({ type: [SchemaTypes.ObjectId], default: [] }) productIds!: string[];
  @Prop({ type: SchemaTypes.ObjectId, required: true }) inputMediaId!: string;
  @Prop({ type: [String], default: [] }) inputKeys!: string[];
  @Prop({ type: [String], default: [] }) outputKeys!: string[];
  @Prop({ type: String, enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'EXPIRED'], default: 'PENDING', index: true }) state!: string;
  @Prop({ type: Boolean, default: false }) quotaCharged!: boolean;
  @Prop({ type: Boolean, default: false }) quotaRefunded!: boolean;
  @Prop({ type: String, required: true, unique: true }) quotaEventKey!: string;
  @Prop({ type: String, sparse: true, unique: true }) idempotencyKey?: string;
  @Prop({ type: String, required: true }) consentPolicyVersion!: string;
  @Prop({ type: String, enum: ['office', 'streetwear', 'evening', 'minimalist'] }) style?: 'office' | 'streetwear' | 'evening' | 'minimalist';
  @Prop({ type: Date, required: true }) quotaWindowStart!: Date;
  @Prop({ type: String }) providerJobId?: string;
  @Prop({ type: Date }) providerSubmitStartedAt?: Date;
  @Prop({ type: String, enum: ['QUEUED', 'ANALYZING', 'PLANNING', 'GENERATING', 'COMPLETED', 'FAILED'], default: 'QUEUED' }) phase!: string;
  @Prop({ type: Object }) renderPlan?: FashionRenderPlan;
  @Prop({ type: Number, default: 0 }) attempts!: number;
  @Prop({ type: Date }) nextAttemptAt?: Date;
  @Prop({ type: Date }) leaseUntil?: Date;
  @Prop({ type: String }) leaseId?: string;
  @Prop({ type: String }) errorMessage?: string;
  @Prop({ type: Date }) terminalAt?: Date;
  @Prop({ type: Date, index: true }) expiresAt?: Date;
  @Prop({ type: Boolean, default: false }) inputCleanupDone!: boolean;
  @Prop({ type: Boolean, default: false }) outputCleanupDone!: boolean;
}
export const AiJobSchema = SchemaFactory.createForClass(AiJob);
AiJobSchema.index({ ownerId: 1, createdAt: -1 });
AiJobSchema.index({ state: 1, updatedAt: 1 });

@Schema({ timestamps: true, collection: 'ai_quotas' })
export class AiQuota {
  @Prop({ type: SchemaTypes.ObjectId, required: true }) ownerId!: string;
  @Prop({ type: Date, required: true }) windowStart!: Date;
  @Prop({ type: String, required: true, default: 'DAILY_COMBINED' }) type!: string;
  @Prop({ type: Number, min: 0, default: 0 }) used!: number;
}
export const AiQuotaSchema = SchemaFactory.createForClass(AiQuota);
AiQuotaSchema.index({ ownerId: 1, type: 1, windowStart: 1 }, { unique: true });

@Schema({ timestamps: true, collection: 'ai_consents' })
export class AiConsent {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true }) ownerId!: string;
  @Prop({ type: String, required: true }) policyVersion!: string;
  @Prop({ type: SchemaTypes.ObjectId, required: true }) jobId!: string;
  @Prop({ type: Date, required: true }) acceptedAt!: Date;
}
export const AiConsentSchema = SchemaFactory.createForClass(AiConsent);
AiConsentSchema.index({ jobId: 1 }, { unique: true });
