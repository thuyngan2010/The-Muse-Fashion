import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AiJob, AiJobSchema } from '../ai/ai.schemas.js';
import { Order, OrderSchema } from '../commerce/commerce.schemas.js';
import { OutboxEvent, OutboxEventSchema } from '../operations/outbox-event.schema.js';
import { MediaObject, MediaObjectSchema } from '../storage/media-object.schema.js';
import { StorageModule } from '../storage/storage.module.js';
import { CommunityPostService } from './community-post.service.js';
import { CommunityController, ModerationController, ReviewsController } from './community.controller.js';
import {
  Comment,
  CommentSchema,
  CommunityPost,
  CommunityPostSchema,
  ModerationLog,
  ModerationLogSchema,
  Review,
  ReviewSchema,
} from './community.schemas.js';
import { ModerationService } from './moderation.service.js';
import { ReviewsService } from './reviews.service.js';

@Module({
  imports: [
    StorageModule,
    MongooseModule.forFeature([
      { name: Review.name, schema: ReviewSchema },
      { name: CommunityPost.name, schema: CommunityPostSchema },
      { name: Comment.name, schema: CommentSchema },
      { name: ModerationLog.name, schema: ModerationLogSchema },
      { name: Order.name, schema: OrderSchema },
      { name: MediaObject.name, schema: MediaObjectSchema },
      { name: AiJob.name, schema: AiJobSchema },
      { name: OutboxEvent.name, schema: OutboxEventSchema },
    ]),
  ],
  controllers: [ReviewsController, CommunityController, ModerationController],
  providers: [ReviewsService, CommunityPostService, ModerationService],
})
export class CommunityModule {}
