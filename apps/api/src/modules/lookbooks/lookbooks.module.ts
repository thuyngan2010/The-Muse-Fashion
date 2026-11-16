import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminLookbooksController, LookbooksController } from './lookbooks.controller.js';
import { Lookbook, LookbookSchema } from './lookbook.schema.js';
import { LookbooksService } from './lookbooks.service.js';
import { Product, ProductSchema } from '../catalog/product.schema.js';
import { ProductVariant, ProductVariantSchema } from '../catalog/catalog.schemas.js';
import { MediaObject, MediaObjectSchema } from '../storage/media-object.schema.js';
import { OutboxEvent, OutboxEventSchema } from '../operations/outbox-event.schema.js';
import { StorageModule } from '../storage/storage.module.js';

@Module({
  imports: [StorageModule, MongooseModule.forFeature([
    { name: Lookbook.name, schema: LookbookSchema },
    { name: Product.name, schema: ProductSchema },
    { name: ProductVariant.name, schema: ProductVariantSchema },
    { name: MediaObject.name, schema: MediaObjectSchema },
    { name: OutboxEvent.name, schema: OutboxEventSchema },
  ])],
  providers: [LookbooksService],
  controllers: [LookbooksController, AdminLookbooksController],
})
export class LookbooksModule {}
