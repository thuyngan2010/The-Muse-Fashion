import {
  Body, Controller, Delete, Get, Headers, HttpCode, Param, Patch, Post, Put, Query, Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/roles.decorator.js';
import { Permissions } from '../../common/permissions.decorator.js';
import type { AuthenticatedRequest } from '../../common/auth.guard.js';
import { PaginationQueryDto } from '../../common/pagination-query.dto.js';
import { UsersService } from '../users/users.service.js';
import { CartService } from './cart.service.js';
import { CheckoutService } from './checkout.service.js';
import { InventoryService } from './inventory.service.js';
import { VoucherService } from './voucher.service.js';
import { OrderService } from './order.service.js';
import {
  CancelOrderDto,
  AdminOrdersQueryDto,
  AssignStaffDto,
  CheckoutQuoteDto,
  CheckVoucherDto,
  CreateOrderDto,
  InventoryAdjustDto,
  InventoryLedgerQueryDto,
  OrderStatusDto,
  ReplaceCartDto,
  ShipmentUpdateDto,
  UpdateVoucherDto,
  VoucherWriteDto,
} from './commerce.dto.js';

@ApiTags('Commerce')
@ApiBearerAuth()
@Roles('CUSTOMER')
@Controller('cart')
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get() get(@Req() req: AuthenticatedRequest) { return this.cart.getCart(req.user.sub); }
  @Put() replace(@Req() req: AuthenticatedRequest, @Body() dto: ReplaceCartDto) { return this.cart.replaceCart(req.user.sub, dto.items); }
  @Delete() @HttpCode(204) clear(@Req() req: AuthenticatedRequest) { return this.cart.clearCart(req.user.sub); }
}

@ApiTags('Commerce')
@ApiBearerAuth()
@Roles('CUSTOMER')
@Controller('checkout')
export class CheckoutController {
  constructor(private readonly checkout: CheckoutService) {}

  @Post('quote') quote(@Req() req: AuthenticatedRequest, @Body() dto: CheckoutQuoteDto) {
    return this.checkout.createQuote(req.user.sub, dto);
  }

  @Post('voucher') @HttpCode(200) checkVoucher(@Req() req: AuthenticatedRequest, @Body() dto: CheckVoucherDto) {
    return this.checkout.checkVoucher(req.user.sub, dto);
  }
}

@ApiTags('Commerce')
@ApiBearerAuth()
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly orders: OrderService,
    private readonly users: UsersService,
  ) {}

  @Roles('CUSTOMER')
  @Get()
  list(
    @Req() req: AuthenticatedRequest,
    @Query() query: PaginationQueryDto,
  ) {
    return this.orders.listOrders(req.user.sub, query.page ?? 1, query.limit ?? 20);
  }

  @Roles('CUSTOMER')
  @Post()
  @HttpCode(201)
  create(
    @Req() req: AuthenticatedRequest,
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: CreateOrderDto,
  ) {
    return this.orders.createOrder(req.user.sub, key, dto);
  }

  @Roles('CUSTOMER', 'ADMIN', 'STAFF')
  @Get(':orderId')
  detail(@Req() req: AuthenticatedRequest, @Param('orderId') id: string) {
    return this.orders.getOrder(id, req.user);
  }

  @Roles('CUSTOMER', 'ADMIN', 'STAFF')
  @Post(':orderId/cancel')
  async cancel(
    @Req() req: AuthenticatedRequest,
    @Param('orderId') id: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: CancelOrderDto,
  ) {
    let staffMayCancelOrder = req.user.role === 'ADMIN';
    if (req.user.role === 'STAFF') {
      staffMayCancelOrder = await this.users.hasPermissions(req.user.sub, ['order.cancel'], id);
    }
    return this.orders.cancelOrder(id, req.user, key, dto, staffMayCancelOrder);
  }
}

@ApiTags('Commerce Admin')
@ApiBearerAuth()
@Roles('ADMIN', 'STAFF')
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(private readonly orders: OrderService) {}

  @Get()
  list(@Req() req: AuthenticatedRequest, @Query() query: AdminOrdersQueryDto) {
    return this.orders.listAdminOrders(req.user, query.state, query.page ?? 1, query.limit ?? 20, { q: query.q, customerId: query.customerId });
  }

  @Roles('ADMIN')
  @Patch(':orderId/assign')
  assign(@Req() req: AuthenticatedRequest, @Param('orderId') id: string, @Body() dto: AssignStaffDto) {
    return this.orders.assignStaff(id, dto.staffId, req.user.sub);
  }

  @Permissions('order.manage')
  @Patch(':orderId/status')
  status(@Req() req: AuthenticatedRequest, @Param('orderId') id: string, @Body() dto: OrderStatusDto) {
    return this.orders.updateStatus(id, req.user.sub, dto);
  }

  @Permissions('shipment.manage')
  @Patch(':orderId/shipment')
  shipment(@Req() req: AuthenticatedRequest, @Param('orderId') id: string, @Body() dto: ShipmentUpdateDto) {
    return this.orders.updateShipment(id, req.user.sub, dto);
  }
}

@ApiTags('Inventory')
@ApiBearerAuth()
@Roles('ADMIN', 'STAFF')
@Permissions('inventory.manage')
@Controller('admin/inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get() list() { return this.inventory.list(); }
  @Get('ledger') ledger(@Query() query: InventoryLedgerQueryDto) {
    return this.inventory.listLedger(query.variantId, query.page ?? 1, query.limit ?? 20);
  }
  @Patch() adjust(@Req() req: AuthenticatedRequest, @Headers('idempotency-key') key: string | undefined, @Body() dto: InventoryAdjustDto) {
    return this.inventory.adjust(req.user.sub, key, dto);
  }
}

@ApiTags('Vouchers')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/vouchers')
export class VouchersController {
  constructor(private readonly vouchers: VoucherService) {}

  @Get() list() { return this.vouchers.list(); }
  @Post() create(@Req() req: AuthenticatedRequest, @Body() dto: VoucherWriteDto) { return this.vouchers.create(dto, req.user.sub); }
  @Patch(':voucherId') update(@Req() req: AuthenticatedRequest, @Param('voucherId') id: string, @Body() dto: UpdateVoucherDto) { return this.vouchers.update(id, dto, req.user.sub); }
  @Delete(':voucherId') @HttpCode(204) delete(@Req() req: AuthenticatedRequest, @Param('voucherId') id: string) { return this.vouchers.remove(id, req.user.sub); }
}
