import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SystemSetting, SystemSettingSchema } from '../admin/admin.schemas.js';
import { Product, ProductSchema } from '../catalog/product.schema.js';
import { Category, CategorySchema } from '../catalog/catalog.schemas.js';
import { MediaObject, MediaObjectSchema } from '../storage/media-object.schema.js';
import { StorageModule } from '../storage/storage.module.js';
import { AiCleanupWorker } from './ai-cleanup.worker.js';
import { AiController } from './ai.controller.js';
import { AdminAiController } from './ai-admin.controller.js';
import { AiAdminService } from './ai-admin.service.js';
import { User, UserSchema } from '../users/user.schema.js';
import { AiProviderService } from './ai-provider.service.js';
import { AiQuotaService } from './ai-quota.service.js';
import { AiWorkerService } from './ai-worker.service.js';
import { AiConsent, AiConsentSchema, AiJob, AiJobSchema, AiQuota, AiQuotaSchema } from './ai.schemas.js';
import { AiService } from './ai.service.js';
import { AiFashionPlannerService } from './ai-fashion-planner.service.js';
import { OutboxEvent, OutboxEventSchema } from '../operations/outbox-event.schema.js';

@Module({
  imports: [
    StorageModule,
    MongooseModule.forFeature([
      { name: AiJob.name, schema: AiJobSchema },
      { name: AiQuota.name, schema: AiQuotaSchema },
      { name: AiConsent.name, schema: AiConsentSchema },
      { name: Product.name, schema: ProductSchema },
      { name: Category.name, schema: CategorySchema },
      { name: User.name, schema: UserSchema },
      { name: MediaObject.name, schema: MediaObjectSchema },
      { name: SystemSetting.name, schema: SystemSettingSchema },
      { name: OutboxEvent.name, schema: OutboxEventSchema },
    ]),
  ],
  controllers: [AiController, AdminAiController],
  providers: [AiAdminService, AiService, AiQuotaService, AiProviderService, AiFashionPlannerService, AiWorkerService, AiCleanupWorker],
  exports: [MongooseModule, AiService],
})
export class AiModule {}
