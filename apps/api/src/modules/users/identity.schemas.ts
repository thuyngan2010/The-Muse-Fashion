import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes } from 'mongoose';

@Schema({ timestamps: true, collection: 'addresses' })
export class Address {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true }) customerId: string;
  @Prop({ type: String, required: true }) receiver: string;
  @Prop({ type: String, required: true }) phone: string;
  @Prop({ type: Object, required: true }) location: Record<string, unknown>;
  @Prop({ type: String, default: null }) note?: string | null;
  @Prop({ type: Boolean, default: false }) isDefault: boolean;
}
export const AddressSchema = SchemaFactory.createForClass(Address);
AddressSchema.index({ customerId: 1, isDefault: 1 }, { unique: true, partialFilterExpression: { isDefault: true } });

@Schema({ timestamps: true, collection: 'auth_sessions' })
export class AuthSession {
  @Prop({ type: Boolean, default: true }) persistent?: boolean;
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true }) userId: string;
  @Prop({ type: String, required: true, unique: true }) refreshHash: string;
  @Prop({ type: Date, required: true, expires: 0 }) expiresAt: Date;
  @Prop({ type: Date }) revokedAt?: Date;
  @Prop({ type: String }) familyId?: string;
}
export const AuthSessionSchema = SchemaFactory.createForClass(AuthSession);
AuthSessionSchema.index({ familyId: 1 });

@Schema({ timestamps: true, collection: 'email_tokens' })
export class EmailToken {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true }) userId: string;
  @Prop({ type: String, enum: ['VERIFY_EMAIL', 'RESET_PASSWORD'], required: true }) purpose: string;
  @Prop({ type: String, required: true, unique: true }) tokenHash: string;
  @Prop({ type: Date, required: true, expires: 0 }) expiresAt: Date;
  @Prop({ type: Date }) usedAt?: Date;
}
export const EmailTokenSchema = SchemaFactory.createForClass(EmailToken);

@Schema({ timestamps: true, collection: 'staff_permissions' })
export class StaffPermission {
  @Prop({ type: SchemaTypes.ObjectId, required: true }) staffId: string;
  @Prop({ type: String, required: true }) permission: string;
  @Prop({ type: String, enum: ['GLOBAL', 'ASSIGNED'], required: true }) scope: string;
  @Prop({ type: SchemaTypes.ObjectId, required: true }) grantedBy: string;
}
export const StaffPermissionSchema = SchemaFactory.createForClass(StaffPermission);
StaffPermissionSchema.index({ staffId: 1, permission: 1, scope: 1 }, { unique: true });
