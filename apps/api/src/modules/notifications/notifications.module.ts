import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NotificationsController } from './notifications.controller.js';
import { Notification, NotificationSchema } from './notification.schema.js';
import { NotificationsService } from './notifications.service.js';
import { NotificationCleanupWorker } from './notification-cleanup.worker.js';

@Module({
  imports: [MongooseModule.forFeature([{ name: Notification.name, schema: NotificationSchema }])],
  providers: [NotificationsService, NotificationCleanupWorker],
  controllers: [NotificationsController],
  exports: [NotificationsService],
})
export class NotificationsModule {}
