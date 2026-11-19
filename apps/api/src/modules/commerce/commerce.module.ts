import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CatalogModule } from '../catalog/catalog.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { Product, ProductSchema } from '../catalog/product.schema.js';
import { UsersModule } from '../users/users.module.js';
import { OperationsModule } from '../operations/operations.module.js';
import { SystemSetting, SystemSettingSchema } from '../admin/admin.schemas.js';
import { Address, AddressSchema } from '../users/identity.schemas.js';
import { PaymentAttempt, PaymentAttemptSchema, Refund, RefundSchema } from '../payments/payment.schemas.js';
import {
  AdminOrdersController,
  CartController,
  CheckoutController,
  InventoryController,
  OrdersController,
  VouchersController,
} from './commerce.controller.js';
import {
  Cart,
  CartSchema,
  CheckoutQuote,
  CheckoutQuoteSchema,
  InventoryLedger,
  InventoryLedgerSchema,
  Order,
  OrderEvent,
  OrderEventSchema,
  OrderSchema,
  Shipment,
  ShipmentSchema,
  Voucher,
  VoucherSchema,
} from './commerce.schemas.js';
import { CartService } from './cart.service.js';
import { CheckoutService } from './checkout.service.js';
import { InventoryService } from './inventory.service.js';
import { VoucherService } from './voucher.service.js';
import { PricingService } from './pricing.service.js';
import { InventoryReservationService } from './inventory-reservation.service.js';
import { OrderService } from './order.service.js';
import { OrderExpiryWorker } from './order-expiry.worker.js';

@Module({
  imports: [
    CatalogModule,
    StorageModule,
    UsersModule,
    OperationsModule,
    MongooseModule.forFeature([
      { name: Product.name, schema: ProductSchema },
      { name: Cart.name, schema: CartSchema },
      { name: CheckoutQuote.name, schema: CheckoutQuoteSchema },
      { name: Order.name, schema: OrderSchema },
      { name: OrderEvent.name, schema: OrderEventSchema },
      { name: InventoryLedger.name, schema: InventoryLedgerSchema },
      { name: Voucher.name, schema: VoucherSchema },
      { name: Shipment.name, schema: ShipmentSchema },
      { name: SystemSetting.name, schema: SystemSettingSchema },
      { name: Address.name, schema: AddressSchema },
      { name: PaymentAttempt.name, schema: PaymentAttemptSchema },
      { name: Refund.name, schema: RefundSchema },
    ]),
  ],
  providers: [
    CartService,
    CheckoutService,
    InventoryService,
    VoucherService,
    PricingService,
    InventoryReservationService,
    OrderService,
    OrderExpiryWorker,
  ],
  controllers: [CartController, CheckoutController, OrdersController, AdminOrdersController, InventoryController, VouchersController],
  exports: [OrderService],
})
export class CommerceModule {}
