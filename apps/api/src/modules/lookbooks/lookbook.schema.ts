import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes } from 'mongoose';

@Schema({ _id: false })
export class LookbookHotspot {
  @Prop({ type: SchemaTypes.ObjectId, required: true }) productId!: string;
  @Prop({ type: Number, required: true, min: 0, max: 1 }) x!: number;
  @Prop({ type: Number, required: true, min: 0, max: 1 }) y!: number;
}
export const LookbookHotspotSchema = SchemaFactory.createForClass(LookbookHotspot);

@Schema({ timestamps: true, collection: 'lookbooks' })
export class Lookbook {
  @Prop({ type: String, required: true, trim: true }) title!: string;
  @Prop({ type: String, default: '' }) description!: string;
  @Prop({ type: SchemaTypes.ObjectId, required: true }) mainMediaId!: string;
  @Prop({ type: [LookbookHotspotSchema], default: [] }) items!: LookbookHotspot[];
  @Prop({ type: [String], default: [], index: true }) tags!: string[];
  @Prop({ type: String, enum: ['DRAFT', 'PUBLISHED', 'HIDDEN'], default: 'DRAFT', index: true }) status!: string;
  @Prop({ type: Number, default: 1, min: 1 }) version!: number;
}
export const LookbookSchema = SchemaFactory.createForClass(Lookbook);
