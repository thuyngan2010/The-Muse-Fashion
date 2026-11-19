import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes } from 'mongoose';
import type { HydratedDocument } from 'mongoose';

export type ProductDocument = HydratedDocument<Product>;

@Schema({ _id: false })
export class SizeGuideRow {
  @Prop({ type: String, required: true }) size!: string;
  @Prop({ type: Object, default: {} }) measurements!: Record<string, number>;
}
export const SizeGuideRowSchema = SchemaFactory.createForClass(SizeGuideRow);

@Schema({ timestamps: true, collection: 'products' })
export class Product {
  @Prop({ type: String, required: true, unique: true, trim: true, lowercase: true }) slug!: string;
  @Prop({ type: String, required: true, trim: true }) name!: string;
  @Prop({ type: String, default: '' }) description!: string;
  @Prop({ type: String, default: '' }) material!: string;
  @Prop({ type: SchemaTypes.ObjectId, default: null, index: true }) categoryId?: string | null;
  @Prop({ type: Number, required: true, min: 0 }) price!: number;
  @Prop({ type: String, default: 'VND', enum: ['VND'] }) currency!: string;
  @Prop({ type: [String], default: [] }) images!: string[];
  @Prop({ type: [SchemaTypes.ObjectId], default: [] }) imageMediaIds!: string[];
  /** Ảnh dùng cho AI thử đồ/phối đồ: một URL trong images hoặc một id trong imageMediaIds. Không bắt buộc. */
  @Prop({ type: String, default: undefined }) aiReferenceImage?: string | null;
  @Prop({ type: [SizeGuideRowSchema], default: [] }) sizeGuide!: SizeGuideRow[];
  @Prop({ type: String, enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'], default: 'DRAFT' }) status!: string;
}
export const ProductSchema = SchemaFactory.createForClass(Product);
ProductSchema.index({ status: 1, createdAt: -1 });
ProductSchema.index({ status: 1, categoryId: 1, createdAt: -1 });
ProductSchema.index({ name: 'text', description: 'text' });
