import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes } from 'mongoose';

@Schema({ timestamps: true, collection: 'system_settings' })
export class SystemSetting {
  @Prop({ type: String, required: true, unique: true }) key!: string;
  @Prop({ type: SchemaTypes.Mixed, required: true }) value!: unknown;
  @Prop({ type: SchemaTypes.ObjectId, required: true }) updatedBy!: string;
  @Prop({ type: Number, required: true, min: 1, default: 1 }) version!: number;
}
export const SystemSettingSchema = SchemaFactory.createForClass(SystemSetting);
