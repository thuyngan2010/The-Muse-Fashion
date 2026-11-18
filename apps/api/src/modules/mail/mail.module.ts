import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MailService } from './mail.service.js';
import { EmailEvent, EmailEventSchema } from './email-event.schema.js';
import { EmailDispatchService } from './email-dispatch.service.js';
import { EmailWorkerService } from './email-worker.service.js';
import { Order, OrderEvent, OrderEventSchema, OrderSchema, Shipment, ShipmentSchema } from '../commerce/commerce.schemas.js';
import { ProductVariant, ProductVariantSchema } from '../catalog/catalog.schemas.js';

@Module({
  imports: [MongooseModule.forFeature([
    { name: EmailEvent.name, schema: EmailEventSchema },
    // Chỉ đọc, dùng để dựng nội dung email đơn hàng.
    { name: Order.name, schema: OrderSchema },
    { name: Shipment.name, schema: ShipmentSchema },
    { name: OrderEvent.name, schema: OrderEventSchema },
    { name: ProductVariant.name, schema: ProductVariantSchema },
  ])],
  providers: [MailService, EmailDispatchService, EmailWorkerService],
  exports: [MailService, EmailDispatchService],
})
export class MailModule {}
