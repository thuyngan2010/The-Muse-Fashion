import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes } from 'mongoose';

@Schema({ timestamps: true, collection: 'categories' })
export class Category {
  @Prop({ type: String, required: true, unique: true }) slug!: string;
  @Prop({ type: String, required: true }) name!: string;
  @Prop({ type: SchemaTypes.ObjectId, default: null }) parentId?: string | null;
  @Prop({ type: String, enum: ['ACTIVE', 'HIDDEN'], default: 'ACTIVE', index: true }) status!: string;
}
export const CategorySchema = SchemaFactory.createForClass(Category);

@Schema({ timestamps: true, collection: 'product_variants' })
export class ProductVariant {
  @Prop({ type: SchemaTypes.ObjectId, required: true, index: true }) productId!: string;
  @Prop({ type: String, required: true, unique: true }) sku!: string;
  @Prop({ type: String }) size?: string;
  @Prop({ type: String }) color?: string;
  @Prop({ type: Number, required: true, min: 0 }) price!: number;
  @Prop({ type: Number, required: true, min: 0, default: 0 }) stockOnHand!: number;
  @Prop({ type: Number, required: true, min: 0, default: 0 }) reserved!: number;
  @Prop({ type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' }) status!: string;
  @Prop({ type: Number, min: 1, default: 1 }) version!: number;
}
export const ProductVariantSchema = SchemaFactory.createForClass(ProductVariant);
ProductVariantSchema.index({ productId: 1, status: 1 });
ProductVariantSchema.index({ productId: 1, status: 1, price: 1 });
ProductVariantSchema.index({ productId: 1, status: 1, color: 1, size: 1, price: 1 });
