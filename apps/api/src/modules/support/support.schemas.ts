import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes } from 'mongoose';
import type { SupportSenderRole, SupportTicketCategory, SupportTicketStatus } from '@fashion/contracts';

export const SUPPORT_CATEGORIES: readonly SupportTicketCategory[] = ['ORDER', 'SIZE', 'PAYMENT_REFUND', 'PRODUCT', 'ACCOUNT', 'OTHER'];
export const SUPPORT_STATUSES: readonly SupportTicketStatus[] = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];
export const SUPPORT_SENDER_ROLES: readonly SupportSenderRole[] = ['CUSTOMER', 'STAFF', 'ADMIN', 'SYSTEM'];

@Schema({ timestamps: true, collection: 'support_tickets' })
export class SupportTicket {
  createdAt!: Date;
  updatedAt!: Date;
  @Prop({ type: String, required: true, unique: true }) code!: string;
  @Prop({ type: SchemaTypes.ObjectId, required: true }) customerId!: string;
  @Prop({ type: String, required: true, trim: true }) subject!: string;
  @Prop({ type: String, enum: SUPPORT_CATEGORIES, required: true }) category!: SupportTicketCategory;
  @Prop({ type: SchemaTypes.ObjectId }) orderId?: string;
  @Prop({ type: String, enum: SUPPORT_STATUSES, default: 'OPEN' }) status!: SupportTicketStatus;
  @Prop({ type: SchemaTypes.ObjectId }) assignedStaffId?: string;
  @Prop({ type: Date, required: true }) lastMessageAt!: Date;
  @Prop({ type: String, default: '' }) lastMessagePreview!: string;
  @Prop({ type: Number, default: 0, min: 0 }) unreadForCustomer!: number;
  @Prop({ type: Number, default: 0, min: 0 }) unreadForStaff!: number;
  @Prop({ type: Date }) firstResponseAt?: Date;
}
export const SupportTicketSchema = SchemaFactory.createForClass(SupportTicket);
SupportTicketSchema.index({ customerId: 1, lastMessageAt: -1 });
SupportTicketSchema.index({ status: 1, lastMessageAt: -1 });
SupportTicketSchema.index({ assignedStaffId: 1, status: 1 });

@Schema({ timestamps: true, collection: 'support_messages' })
export class SupportMessage {
  createdAt!: Date;
  updatedAt!: Date;
  @Prop({ type: SchemaTypes.ObjectId, required: true }) ticketId!: string;
  @Prop({ type: SchemaTypes.ObjectId, required: true }) senderId!: string;
  @Prop({ type: String, enum: SUPPORT_SENDER_ROLES, required: true }) senderRole!: SupportSenderRole;
  @Prop({ type: String, required: true, maxlength: 2000 }) body!: string;
}
export const SupportMessageSchema = SchemaFactory.createForClass(SupportMessage);
SupportMessageSchema.index({ ticketId: 1, createdAt: 1 });
