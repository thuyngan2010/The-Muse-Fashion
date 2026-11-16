import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Order, OrderSchema } from '../commerce/commerce.schemas.js';
import { PaymentAttempt, PaymentAttemptSchema, Refund, RefundSchema } from '../payments/payment.schemas.js';
import { OperationsModule } from '../operations/operations.module.js';
import { User, UserSchema } from '../users/user.schema.js';
import { EmailToken, EmailTokenSchema, StaffPermission, StaffPermissionSchema } from '../users/identity.schemas.js';
import { MailModule } from '../mail/mail.module.js';
import { AdminConfigService } from './admin-config.service.js';
import { AdminController } from './admin.controller.js';
import { SystemSetting, SystemSettingSchema } from './admin.schemas.js';
import { AdminService } from './admin.service.js';
import { SalesReportService } from './sales-report.service.js';

@Module({
  imports: [
    OperationsModule,
    MailModule,
    MongooseModule.forFeature([
      { name: SystemSetting.name, schema: SystemSettingSchema },
      { name: User.name, schema: UserSchema },
      { name: StaffPermission.name, schema: StaffPermissionSchema },
      { name: EmailToken.name, schema: EmailTokenSchema },
      { name: PaymentAttempt.name, schema: PaymentAttemptSchema },
      { name: Refund.name, schema: RefundSchema },
      { name: Order.name, schema: OrderSchema },
    ]),
  ],
  providers: [AdminService, AdminConfigService, SalesReportService],
  controllers: [AdminController],
})
export class AdminModule {}
