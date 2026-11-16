import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StorageService } from './storage.service.js';
import { StorageController } from './storage.controller.js';
import { MediaObject, MediaObjectSchema } from './media-object.schema.js';
import { StorageCleanupWorker } from './storage-cleanup.worker.js';
import { UsersModule } from '../users/users.module.js';
import { Product, ProductSchema } from '../catalog/product.schema.js';
import { Lookbook, LookbookSchema } from '../lookbooks/lookbook.schema.js';
import { AiJob, AiJobSchema } from '../ai/ai.schemas.js';

@Module({
  imports: [UsersModule, MongooseModule.forFeature([
    { name: MediaObject.name, schema: MediaObjectSchema },
    { name: Product.name, schema: ProductSchema },
    { name: Lookbook.name, schema: LookbookSchema },
    { name: AiJob.name, schema: AiJobSchema },
  ])],
  providers: [StorageService, StorageCleanupWorker],
  controllers: [StorageController],
  exports: [StorageService, MongooseModule],
})
export class StorageModule {}
