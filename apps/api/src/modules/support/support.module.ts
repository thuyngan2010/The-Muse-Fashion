import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Order, OrderSchema } from '../commerce/commerce.schemas.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { OperationsModule } from '../operations/operations.module.js';
import { User, UserSchema } from '../users/user.schema.js';
import { UsersModule } from '../users/users.module.js';
import { AdminSupportController } from './admin-support.controller.js';
import { SupportController } from './support.controller.js';
import { SupportService } from './support.service.js';
import { SupportMessage, SupportMessageSchema, SupportTicket, SupportTicketSchema } from './support.schemas.js';

@Module({
  imports: [
    UsersModule,
    NotificationsModule,
    OperationsModule,
    MongooseModule.forFeature([
      { name: SupportTicket.name, schema: SupportTicketSchema },
      { name: SupportMessage.name, schema: SupportMessageSchema },
      { name: Order.name, schema: OrderSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [SupportController, AdminSupportController],
  providers: [SupportService],
})
export class SupportModule {}
