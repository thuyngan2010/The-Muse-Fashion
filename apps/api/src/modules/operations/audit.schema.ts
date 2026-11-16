import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes } from 'mongoose';

@Schema({ timestamps: true, collection: 'audit_logs' })
export class AuditLog {
  @Prop({ type: SchemaTypes.ObjectId }) actorId?: string;
  @Prop({ type: String, required: true, index: true }) action: string;
  @Prop({ type: String, required: true }) entityType: string;
  @Prop({ type: String, required: true }) entityId: string;
  @Prop({ type: Object, default: {} }) metadata: Record<string, unknown>;
}
export type AuditLogDocument = HydratedDocument<AuditLog>;
export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);
AuditLogSchema.index({ createdAt: -1 });
