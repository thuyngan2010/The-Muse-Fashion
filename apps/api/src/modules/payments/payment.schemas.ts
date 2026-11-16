import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes } from 'mongoose';

@Schema({ timestamps: true, collection: 'payment_attempts' })
export class PaymentAttempt {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true }) orderId!: string;
  @Prop({ type: String, enum: ['GPMPAY', 'SEPAY'], default: 'GPMPAY' }) provider!: string;
  @Prop({ type: String, required: true }) reconciliationCode!: string;
  @Prop({ type: Number, required: true, min: 0 }) expectedAmount!: number;
  @Prop({ type: String, enum: ['VND'], default: 'VND' }) currency!: string;
  @Prop({ type: String, required: true, index: true }) state!: string;
  @Prop({ type: Date, required: true, index: true }) expiresAt!: Date;
  @Prop({ type: Date }) paidAt?: Date;
  @Prop({ type: String }) matchedEventId?: string;
  @Prop({ type: Number, default: 0 }) refundBudgetVersion?: number;
  @Prop({ type: String, unique: true, sparse: true }) idempotencyKey?: string;
}
export const PaymentAttemptSchema = SchemaFactory.createForClass(PaymentAttempt);
PaymentAttemptSchema.index({ provider: 1, reconciliationCode: 1 }, { unique: true });
PaymentAttemptSchema.index({ orderId: 1 }, { name: 'order_succeeded_unique', unique: true, partialFilterExpression: { state: 'SUCCEEDED' } });
PaymentAttemptSchema.index({ orderId: 1 }, { name: 'order_pending_unique', unique: true, partialFilterExpression: { state: 'PENDING' } });

@Schema({ timestamps: true, collection: 'payment_events' })
export class PaymentEvent {
  @Prop({ type: String, enum: ['GPMPAY', 'SEPAY'], default: 'GPMPAY' }) provider!: string;
  @Prop({ type: String, required: true }) eventId!: string;
  @Prop({ type: String }) gateway?: string;
  @Prop({ type: String }) accountNumberHash?: string;
  @Prop({ type: String }) accountNumberLast4?: string;
  @Prop({ type: String, required: true }) transferType!: string;
  @Prop({ type: Number, required: true }) transferAmount!: number;
  @Prop({ type: String }) referenceCode?: string;
  @Prop({ type: String }) source?: string;
  @Prop({ type: String }) content?: string;
  @Prop({ type: String }) counterAccountHash?: string;
  @Prop({ type: String }) counterAccountLast4?: string;
  @Prop({ type: String }) counterBankBin?: string;
  @Prop({ type: Date }) transactionDate?: Date;
  @Prop({ type: SchemaTypes.ObjectId, index: true }) matchedAttemptId?: string;
  @Prop({ type: SchemaTypes.ObjectId, index: true }) matchedRefundId?: string;
  @Prop({ type: Boolean, required: true }) signatureVerified!: boolean;
  @Prop({ type: String, enum: ['HMAC_SHA256', 'API_KEY'] }) authenticationMethod?: string;
  @Prop({ type: String, required: true }) payloadDigest!: string;
  @Prop({ type: String, required: true, index: true }) resolution!: string;
  @Prop({ type: SchemaTypes.ObjectId }) reviewedBy?: string;
  @Prop({ type: Date }) reviewedAt?: Date;
  @Prop({ type: String }) reviewDecision?: string;
  @Prop({ type: String }) reviewNote?: string;
  @Prop({ type: String }) evidenceObjectKey?: string;
  @Prop({ type: Object }) reviewProposal?: {
    decision: string; note: string; evidenceObjectKey: string; amount?: number;
    bankReference?: string; proposedBy: string; proposedAt: Date; requestHash: string;
  };
  @Prop({ type: String }) reviewApprovalHash?: string;
  @Prop({ type: String }) settlementBankReference?: string;
}
export const PaymentEventSchema = SchemaFactory.createForClass(PaymentEvent);
PaymentEventSchema.index({ provider: 1, eventId: 1 }, { unique: true });
PaymentEventSchema.index({ matchedAttemptId: 1, resolution: 1 });
PaymentEventSchema.index({ provider: 1, settlementBankReference: 1 }, {
  name: 'payment_settlement_reference_unique', unique: true,
  partialFilterExpression: { settlementBankReference: { $type: 'string' } },
});
PaymentAttemptSchema.index({ orderId: 1, createdAt: -1, _id: -1 });

@Schema({ timestamps: true, collection: 'refunds' })
export class Refund {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true }) paymentAttemptId!: string;
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true }) orderId!: string;
  @Prop({ type: Number, required: true, min: 1 }) amount!: number;
  @Prop({ type: String, required: true, index: true }) state!: string;
  @Prop({ type: String, required: true, unique: true }) idempotencyKey!: string;
  @Prop({ type: String }) requestHash?: string;
  @Prop({ type: String }) beneficiaryIdempotencyKey?: string;
  @Prop({ type: String }) beneficiaryRequestHash?: string;
  @Prop({ type: String }) approvalIdempotencyKey?: string;
  @Prop({ type: String }) completionIdempotencyKey?: string;
  @Prop({ type: String }) completionRequestHash?: string;
  @Prop({ type: String }) failureIdempotencyKey?: string;
  @Prop({ type: String }) failureRequestHash?: string;
  @Prop({ type: String }) failureReason?: string;
  @Prop({ type: String, required: true }) reason!: string;
  @Prop({ type: SchemaTypes.ObjectId, required: true }) proposedBy!: string;
  @Prop({ type: SchemaTypes.ObjectId }) approvedBy?: string;
  @Prop({ type: SchemaTypes.ObjectId }) confirmedBy?: string;
  @Prop({ type: SchemaTypes.ObjectId }) beneficiarySetBy?: string;
  @Prop({ type: String }) bankReference?: string;
  @Prop({ type: String }) evidenceKey?: string;
  @Prop({ type: Object }) beneficiary?: { bankBin: string; accountNumber: string; accountName: string };
  @Prop({ type: String, select: false }) beneficiaryEncrypted?: string;
  @Prop({ type: String, unique: true, sparse: true }) reconciliationCode?: string;
  @Prop({ type: String }) transferContent?: string;
  @Prop({ type: Date }) approvedAt?: Date;
  @Prop({ type: Date }) refundedAt?: Date;
  @Prop({ type: String, unique: true, sparse: true }) matchedEventId?: string;
}
export const RefundSchema = SchemaFactory.createForClass(Refund);
RefundSchema.index({ state: 1, createdAt: -1 });
