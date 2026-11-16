import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MailModule } from '../mail/mail.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { UsersModule } from '../users/users.module.js';
import { Comment, CommentSchema, CommunityPost, CommunityPostSchema } from '../community/community.schemas.js';
import { Lookbook, LookbookSchema } from '../lookbooks/lookbook.schema.js';
import { AuditLog, AuditLogSchema } from './audit.schema.js';
import { OutboxEvent, OutboxEventSchema } from './outbox-event.schema.js';
import { AuditService } from './audit.service.js';
import { OutboxProcessorService } from './outbox-processor.service.js';
import { OutboxWorkerService } from './outbox-worker.service.js';
import { AuditController } from './audit.controller.js';

@Module({
  imports: [
    MailModule,
    NotificationsModule,
    UsersModule,
    MongooseModule.forFeature([
      { name: AuditLog.name, schema: AuditLogSchema },
      { name: OutboxEvent.name, schema: OutboxEventSchema },
      { name: CommunityPost.name, schema: CommunityPostSchema },
      { name: Comment.name, schema: CommentSchema },
      { name: Lookbook.name, schema: LookbookSchema },
    ]),
  ],
  providers: [AuditService, OutboxProcessorService, OutboxWorkerService],
  controllers: [AuditController],
  exports: [MongooseModule, AuditService],
})
export class OperationsModule {}
