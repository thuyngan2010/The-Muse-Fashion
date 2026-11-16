import { describe, expect, it } from 'vitest';
import { PricingService } from './pricing.service.js';

describe('PricingService', () => {
  const service = new PricingService({ find: async () => ({ lean: async () => ({ exec: async () => [] }) }) } as never, {} as never);

  it('waives shipping when subtotal reaches the free threshold', () => {
    const settings = { standardShippingFee: 30_000, freeShippingThreshold: 1_000_000, lowStockThreshold: 5 };
    expect(service.shippingFee(999_999, settings)).toBe(30_000);
    expect(service.shippingFee(1_000_000, settings)).toBe(0);
  });

  it('applies voucher only to merchandise and keeps shipping separate', () => {
    const settings = { standardShippingFee: 30_000, freeShippingThreshold: 1_000_000, lowStockThreshold: 5 };
    const totals = service.totals(200_000, 50_000, settings);
    expect(totals.voucherDiscount).toBe(50_000);
    expect(totals.payableTotal).toBe(180_000);
  });

  it('rejects a fully discounted order with free shipping before it can be quoted', () => {
    const settings = { standardShippingFee: 30_000, freeShippingThreshold: 1_000_000, lowStockThreshold: 5 };
    expect(() => service.totals(1_000_000, 1_000_000, settings)).toThrow('Đơn hàng phải có số tiền thanh toán lớn hơn 0đ');
    // A 100% merchandise discount remains usable if a positive delivery fee is due.
    expect(service.totals(200_000, 200_000, settings).payableTotal).toBe(30_000);
  });

  it.each([
    [null, 'VOUCHER_INVALID'],
    [{ status: 'DISABLED' }, 'VOUCHER_DISABLED'],
    [{ validTo: new Date(0) }, 'VOUCHER_EXPIRED'],
    [{ usedCount: 10 }, 'VOUCHER_EXHAUSTED'],
    [{ minimumSubtotal: 500_000 }, 'VOUCHER_MINIMUM_NOT_MET'],
  ])('returns a stable voucher error code for checkout recovery', async (overrides, code) => {
    const voucher = overrides === null ? null : {
      status: 'ACTIVE', validFrom: new Date(0), validTo: new Date(Date.now() + 60_000),
      usedCount: 0, usageLimit: 10, minimumSubtotal: 0, type: 'FIXED', value: 10_000, ...overrides,
    };
    const pricing = new PricingService({} as never, { findOne: () => ({ exec: async () => voucher }) } as never);
    try {
      await pricing.resolveVoucher('INVALID', 200_000);
      expect.fail('Expected a voucher rejection');
    } catch (error) {
      expect((error as { getResponse(): unknown }).getResponse()).toMatchObject({ code });
    }
  });
});
