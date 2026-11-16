import {
  Body, Controller, Get, Headers, HttpCode, Param, Patch, Post, Query, Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../../common/public.decorator.js';
import { Roles } from '../../common/roles.decorator.js';
import { Permissions } from '../../common/permissions.decorator.js';
import type { AuthenticatedRequest } from '../../common/auth.guard.js';
import { PaginationQueryDto } from '../../common/pagination-query.dto.js';
import { PaymentService } from './payment.service.js';
import { GpmpayWebhookService } from './gpmpay-webhook.service.js';
import { SepayWebhookService } from './sepay-webhook.service.js';
import { RefundService } from './refund.service.js';
import { PaymentReviewService } from './payment-review.service.js';
import { PaymentReviewDto, PaymentReviewQueryDto } from './payment-review.dto.js';
import { CreatePaymentAttemptDto, RefundListQueryDto } from './payments.dto.js';
import {
  CompleteRefundDto,
  FailRefundDto,
  ProposeRefundDto,
  RefundBeneficiaryDto,
  RejectRefundDto,
} from './refunds.dto.js';

@ApiTags('Payment')
@ApiBearerAuth()
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentService) {}

  @Roles('CUSTOMER', 'ADMIN', 'STAFF')
  @Get()
  list(
    @Req() req: AuthenticatedRequest,
    @Query() query: PaginationQueryDto,
  ) {
    return this.payments.listPayments(req.user, query.page ?? 1, query.limit ?? 20);
  }

  @Roles('CUSTOMER')
  @Post('attempts')
  @HttpCode(201)
  createAttempt(@Req() req: AuthenticatedRequest, @Headers('idempotency-key') key: string | undefined, @Body() dto: CreatePaymentAttemptDto) {
    return this.payments.createAttempt(req.user.sub, key, dto);
  }

  @Roles('CUSTOMER', 'ADMIN', 'STAFF')
  @Get('order/:orderId/latest')
  latest(@Req() req: AuthenticatedRequest, @Param('orderId') orderId: string) {
    return this.payments.latestForOrder(orderId, req.user);
  }

  @Roles('CUSTOMER', 'ADMIN', 'STAFF')
  @Get(':paymentId')
  detail(@Req() req: AuthenticatedRequest, @Param('paymentId') id: string) {
    return this.payments.getPayment(id, req.user);
  }
}

@ApiTags('Payment Webhook')
@Controller('webhooks/payment')
export class PaymentWebhookController {
  constructor(private readonly webhook: GpmpayWebhookService, private readonly sepay: SepayWebhookService) {}

  @Public()
  @Post('gpmpay')
  @HttpCode(204)
  receive(
    @Req() request: RawBodyRequest<Request>,
    @Headers('x-gpmpay-signature') signature: string | undefined,
  ) {
    return this.webhook.handle(request, signature);
  }

  @Public()
  @Post('sepay')
  @HttpCode(200)
  receiveSepay(
    @Req() request: RawBodyRequest<Request>,
    @Headers('authorization') authorization: string | undefined,
  ) {
    return this.sepay.handle(request, authorization);
  }
}

@ApiTags('Refunds')
@ApiBearerAuth()
@Roles('ADMIN', 'STAFF')
@Controller('admin/refunds')
export class RefundsController {
  constructor(private readonly refunds: RefundService) {}

  @Get()
  list(@Req() req: AuthenticatedRequest, @Query() query: RefundListQueryDto) {
    return this.refunds.list(req.user.sub, req.user.role, query.state, query.page ?? 1, query.limit ?? 20);
  }

  @Post()
  @HttpCode(201)
  propose(
    @Req() req: AuthenticatedRequest,
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: ProposeRefundDto,
  ) {
    return this.refunds.propose(req.user.sub, req.user.role, key, dto);
  }

  @Get(':refundId')
  get(@Req() req: AuthenticatedRequest, @Param('refundId') id: string) {
    return this.refunds.get(id, req.user.sub, req.user.role);
  }

  @Patch(':refundId/beneficiary')
  setBeneficiary(
    @Req() req: AuthenticatedRequest,
    @Param('refundId') id: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: RefundBeneficiaryDto,
  ) {
    return this.refunds.setBeneficiary(id, req.user.sub, req.user.role, key, dto);
  }

  @Roles('ADMIN')
  @Patch(':refundId/approve')
  approve(
    @Req() req: AuthenticatedRequest,
    @Param('refundId') id: string,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.refunds.approve(id, req.user.sub, key);
  }

  @Roles('ADMIN')
  @Patch(':refundId/complete')
  complete(
    @Req() req: AuthenticatedRequest,
    @Param('refundId') id: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: CompleteRefundDto,
  ) {
    return this.refunds.completeManual(id, req.user.sub, key, dto);
  }

  @Roles('ADMIN')
  @Patch(':refundId/reject')
  reject(@Req() req: AuthenticatedRequest, @Param('refundId') id: string,
    @Headers('idempotency-key') key: string | undefined, @Body() dto: RejectRefundDto) {
    return this.refunds.reject(id, req.user.sub, key, dto);
  }

  @Roles('ADMIN')
  @Patch(':refundId/fail')
  fail(
    @Req() req: AuthenticatedRequest,
    @Param('refundId') id: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: FailRefundDto,
  ) {
    return this.refunds.fail(id, req.user.sub, key, dto);
  }
}

@ApiTags('Payment Review')
@ApiBearerAuth()
@Roles('ADMIN', 'STAFF')
@Controller('admin/payment-events')
export class PaymentReviewController {
  constructor(private readonly reviews: PaymentReviewService) {}

  @Permissions('payment.read')
  @Get()
  list(@Query() query: PaymentReviewQueryDto) {
    return this.reviews.list(query.page ?? 1, query.limit ?? 20, query.view);
  }

  @Roles('ADMIN')
  @Get(':eventId')
  detail(@Param('eventId') id: string) { return this.reviews.detail(id); }

  @Roles('ADMIN')
  @Patch(':eventId/review')
  review(@Req() req: AuthenticatedRequest, @Param('eventId') id: string, @Body() dto: PaymentReviewDto) {
    return this.reviews.review(id, req.user.sub, dto);
  }
}
