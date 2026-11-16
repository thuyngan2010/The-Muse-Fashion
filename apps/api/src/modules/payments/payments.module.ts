import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CommerceModule } from '../commerce/commerce.module.js';
import { OperationsModule } from '../operations/operations.module.js';
import { UsersModule } from '../users/users.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { Order, OrderSchema } from '../commerce/commerce.schemas.js';
import { PaymentsController, PaymentWebhookController, RefundsController, PaymentReviewController } from './payments.controller.js';
import { PaymentAttempt, PaymentAttemptSchema, PaymentEvent, PaymentEventSchema, Refund, RefundSchema } from './payment.schemas.js';
import { PaymentService } from './payment.service.js';
import { GpmpayWebhookService } from './gpmpay-webhook.service.js';
import { SepayWebhookService } from './sepay-webhook.service.js';
import { RefundService } from './refund.service.js';
import { PaymentReviewService } from './payment-review.service.js';

@Module({
  imports: [
    CommerceModule,
    OperationsModule,
    UsersModule,
    StorageModule,
    MongooseModule.forFeature([
      { name: PaymentAttempt.name, schema: PaymentAttemptSchema },
      { name: PaymentEvent.name, schema: PaymentEventSchema },
      { name: Refund.name, schema: RefundSchema },
      { name: Order.name, schema: OrderSchema },
    ]),
  ],
  providers: [PaymentService, GpmpayWebhookService, SepayWebhookService, RefundService, PaymentReviewService],
  controllers: [PaymentsController, PaymentWebhookController, RefundsController, PaymentReviewController],
})
export class PaymentsModule {}
