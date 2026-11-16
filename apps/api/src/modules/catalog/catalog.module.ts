import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Product, ProductSchema } from './product.schema.js';
import { CatalogController } from './catalog.controller.js';
import { AdminProductsController, CategoriesController, ProductVariantsController, AdminCategoriesController } from './catalog-scaffold.controller.js';
import { Category, CategorySchema, ProductVariant, ProductVariantSchema } from './catalog.schemas.js';
import { CatalogService } from './catalog.service.js';
import { StorageModule } from '../storage/storage.module.js';
import { MediaObject, MediaObjectSchema } from '../storage/media-object.schema.js';
import { OperationsModule } from '../operations/operations.module.js';

@Module({
  imports: [
    StorageModule,
    OperationsModule,
    MongooseModule.forFeature([
      { name: Product.name, schema: ProductSchema },
      { name: Category.name, schema: CategorySchema },
      { name: ProductVariant.name, schema: ProductVariantSchema },
      { name: MediaObject.name, schema: MediaObjectSchema },
    ]),
  ],
  providers: [CatalogService],
  controllers: [CatalogController, CategoriesController, AdminProductsController, ProductVariantsController, AdminCategoriesController],
  exports: [CatalogService, MongooseModule],
})
export class CatalogModule {}
