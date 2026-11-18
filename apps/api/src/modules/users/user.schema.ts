import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import type { UserRole } from '@fashion/contracts';
export type UserDocument = HydratedDocument<User>;
@Schema({ timestamps: true, collection: 'users' })
export class User {
  createdAt!: Date;
  updatedAt!: Date;
  @Prop({ type: String, required: true, unique: true, lowercase: true, trim: true }) email!: string;
  @Prop({ type: String, required: true, select: false }) passwordHash!: string;
  @Prop({ type: String, required: true, trim: true }) fullName!: string;
  @Prop({ type: String, default: null }) phone?: string | null;
  @Prop({ type: String, default: null }) avatarMediaId?: string | null;
  @Prop({ type: String, enum: ['CUSTOMER','ADMIN','STAFF'], default: 'CUSTOMER' }) role!: UserRole;
  @Prop({ type: String, enum: ['PENDING_VERIFICATION','ACTIVE','SUSPENDED'], default: 'PENDING_VERIFICATION' }) status!: string;
  @Prop({ type: Date, default: null }) emailVerifiedAt?: Date | null;
  @Prop({ type: String, select: false, default: null }) verificationTokenHash?: string | null;
  @Prop({ type: Date, default: null }) verificationExpiresAt?: Date | null;
  @Prop({ type: String, select: false, default: null }) registrationStatusTokenHash?: string | null;
  @Prop({ type: Date, default: null }) registrationStatusExpiresAt?: Date | null;
  @Prop({ type: String, unique: true, sparse: true }) googleSub?: string;
  @Prop({ type: Boolean, default: true }) hasPassword?: boolean;
  @Prop({ type: Number, default: 0 }) tokenVersion!: number;
  @Prop({ type: Number, default: 0 }) permissionsVersion!: number;
}
export const UserSchema = SchemaFactory.createForClass(User);
UserSchema.index({ verificationTokenHash: 1 }, { sparse: true });
UserSchema.index({ registrationStatusTokenHash: 1 }, { sparse: true });
