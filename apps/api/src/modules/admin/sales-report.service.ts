import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Order } from '../commerce/commerce.schemas.js';
import type { OrderLineSnapshot } from '../commerce/order.types.js';
import { PaymentAttempt, Refund } from '../payments/payment.schemas.js';
import { REPORT_TIMEZONE, resolveSalesReportRange } from './report-range.util.js';

@Injectable()
export class SalesReportService {
  constructor(
    @InjectModel(PaymentAttempt.name) private readonly payments: Model<PaymentAttempt>,
    @InjectModel(Refund.name) private readonly refunds: Model<Refund>,
    @InjectModel(Order.name) private readonly orders: Model<Order>,
  ) {}

  async build(fromInput?: string, toInput?: string) {
    const { from, to } = resolveSalesReportRange(fromInput, toInput);

    const [payments, refundRows, stateRows] = await Promise.all([
      this.payments.find({
        state: 'SUCCEEDED',
        paidAt: { $gte: from, $lt: to },
      }).lean().exec(),
      this.refunds.find({
        state: 'SUCCEEDED',
        refundedAt: { $gte: from, $lt: to },
      }).lean().exec(),
      this.orders.find({ createdAt: { $gte: from, $lt: to } }).select('state').lean().exec(),
    ]);

    const paidRevenue = payments.reduce((sum, row) => sum + Number(row.expectedAmount ?? 0), 0);
    const refundedAmount = refundRows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
    const orderIds = [...new Set(payments.map((row) => String(row.orderId)))];
    const orders = orderIds.length
      ? await this.orders.find({ _id: { $in: orderIds.map((id) => new Types.ObjectId(id)) } }).lean().exec()
      : [];

    const productQty = new Map<string, number>();
    const productNames = new Map<string, string>();
    for (const order of orders) {
      if (order.state === 'CANCELLED' || order.state === 'CANCEL_PENDING_REFUND') continue;
      const lines = (order.items as OrderLineSnapshot[]) ?? [];
      for (const line of lines) {
        if (!line?.productId) continue;
        const key = String(line.productId);
        productQty.set(key, (productQty.get(key) ?? 0) + Number(line.quantity ?? 0));
        if (line.productName) productNames.set(key, line.productName);
      }
    }

    const topProducts = [...productQty.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([productId, quantity]) => ({ productId, productName: productNames.get(productId) ?? productId, quantity }));

    const dayKey = (date: Date) => new Intl.DateTimeFormat('en-CA', {
      timeZone: REPORT_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(date);
    const byDay = new Map<string, { date: string; paidRevenue: number; refundedAmount: number; netRevenue: number; paymentCount: number }>();
    const rowFor = (date: Date) => {
      const key = dayKey(date);
      if (!byDay.has(key)) byDay.set(key, { date: key, paidRevenue: 0, refundedAmount: 0, netRevenue: 0, paymentCount: 0 });
      return byDay.get(key)!;
    };
    for (const payment of payments) {
      const row = rowFor(new Date(payment.paidAt!));
      row.paidRevenue += payment.expectedAmount;
      row.netRevenue += payment.expectedAmount;
      row.paymentCount += 1;
    }
    for (const refund of refundRows) {
      const row = rowFor(new Date(refund.refundedAt!));
      row.refundedAmount += refund.amount;
      row.netRevenue -= refund.amount;
    }
    const orderStatusCounts = stateRows.reduce<Record<string, number>>((acc, row) => {
      acc[row.state] = (acc[row.state] ?? 0) + 1;
      return acc;
    }, {});

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      timezone: REPORT_TIMEZONE,
      paidRevenue,
      refundedAmount,
      netRevenue: paidRevenue - refundedAmount,
      orderCount: orderIds.length,
      orderStatusCounts,
      daily: [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)),
      topProducts,
      generatedAt: new Date().toISOString(),
    };
  }
}
