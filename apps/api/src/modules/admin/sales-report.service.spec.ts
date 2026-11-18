import { describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { SalesReportService } from './sales-report.service.js';

const lean = <T>(value: T) => ({ lean: () => ({ exec: async () => value }) });

function build(opts: { payments: Array<Record<string, unknown>>; orders: Array<Record<string, unknown>> }) {
  const payments = { find: () => lean(opts.payments) };
  const refunds = { find: () => lean([]) };
  const orders = { find: (filter: Record<string, unknown>) => (filter._id ? lean(opts.orders) : { select: () => lean([]) }) };
  return new SalesReportService(payments as never, refunds as never, orders as never);
}

const line = (productId: string, sku: string, quantity: number, lineTotal: number) =>
  ({ productId, sku, productName: `SP ${productId}`, quantity, lineTotal, unitPrice: lineTotal / quantity, discount: 0, lineId: 'l', variantId: 'v' });

describe('SalesReportService.build topProducts', () => {
  const orderId = new Types.ObjectId();
  const paidAt = new Date('2026-11-10T03:00:00Z');

  it('adds revenue and a single SKU, and never exceeds paid revenue', async () => {
    const service = build({
      payments: [{ orderId, expectedAmount: 400_000, paidAt }],
      orders: [{ _id: orderId, state: 'DELIVERED', items: [line('p1', 'SKU-1', 2, 300_000), line('p2', 'SKU-2', 1, 200_000)] }],
    });
    const report = await service.build('2026-11-01', '2026-11-30');
    const sum = report.topProducts.reduce((s, p) => s + p.revenue, 0);
    expect(sum).toBeLessThanOrEqual(report.paidRevenue);
    expect(report.topProducts.find((p) => p.productId === 'p1')).toMatchObject({ quantity: 2, sku: 'SKU-1', revenue: 240_000 });
  });

  it('keeps full line totals when the payment covers them (shipping on top)', async () => {
    const service = build({
      payments: [{ orderId, expectedAmount: 530_000, paidAt }],
      orders: [{ _id: orderId, state: 'DELIVERED', items: [line('p1', 'SKU-1', 1, 500_000)] }],
    });
    const report = await service.build('2026-11-01', '2026-11-30');
    expect(report.topProducts[0].revenue).toBe(500_000);
  });

  it('omits sku when a product has several variant SKUs and skips cancelled orders', async () => {
    const other = new Types.ObjectId();
    const service = build({
      payments: [{ orderId, expectedAmount: 400_000, paidAt }, { orderId: other, expectedAmount: 100_000, paidAt }],
      orders: [
        { _id: orderId, state: 'DELIVERED', items: [line('p1', 'A', 1, 200_000), line('p1', 'B', 1, 200_000)] },
        { _id: other, state: 'CANCELLED', items: [line('p9', 'Z', 1, 100_000)] },
      ],
    });
    const report = await service.build('2026-11-01', '2026-11-30');
    expect(report.topProducts).toHaveLength(1);
    expect(report.topProducts[0]).not.toHaveProperty('sku');
    expect(report.topProducts[0].revenue).toBe(400_000);
  });
});
