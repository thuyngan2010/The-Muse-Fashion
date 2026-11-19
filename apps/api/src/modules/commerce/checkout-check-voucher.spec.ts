import { describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { CheckoutService } from './checkout.service.js';

const A = '64b000000000000000000001';
const B = '64b000000000000000000002';
const CUSTOMER = '64b0000000000000000000ff';
const line = (variantId: string, quantity: number, unitPrice: number) => ({ variantId, quantity, unitPrice });

describe('CheckoutService.checkVoucher (nhập mã ưu đãi ở giỏ hàng)', () => {
  function build(items = [line(A, 1, 300_000), line(B, 2, 100_000)]) {
    const quotes = { create: vi.fn() };
    const addresses = { findOne: vi.fn() };
    const carts = { getCart: vi.fn().mockResolvedValue({ items, subtotal: 0 }) };
    const pricing = { resolveVoucher: vi.fn().mockResolvedValue({ discount: 20_000, code: 'SALE10' }) };
    const service = new CheckoutService(carts as never, pricing as never, addresses as never, quotes as never);
    return { service, quotes, addresses, pricing };
  }

  it('prices the voucher on the ticked items only and needs no address', async () => {
    const { service, pricing, addresses } = build();
    const result = await service.checkVoucher(CUSTOMER, { voucherCode: 'sale10', variantIds: [B] });
    expect(pricing.resolveVoucher).toHaveBeenCalledWith('sale10', 200_000);
    expect(result).toEqual({ code: 'SALE10', subtotal: 200_000, voucherDiscount: 20_000 });
    expect(addresses.findOne).not.toHaveBeenCalled();
  });

  it('uses the whole cart when nothing is ticked and never stores a quote', async () => {
    const { service, pricing, quotes } = build();
    await service.checkVoucher(CUSTOMER, { voucherCode: 'SALE10' });
    expect(pricing.resolveVoucher).toHaveBeenCalledWith('SALE10', 500_000);
    expect(quotes.create).not.toHaveBeenCalled();
  });

  it('passes voucher rejections (VOUCHER_* codes) straight through', async () => {
    const { service, pricing } = build();
    pricing.resolveVoucher.mockRejectedValueOnce(new BadRequestException({ code: 'VOUCHER_EXPIRED', message: 'Voucher is expired' }));
    await expect(service.checkVoucher(CUSTOMER, { voucherCode: 'OLD' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('answers 400 for an empty cart or a selection that is not in the cart', async () => {
    await expect(build([]).service.checkVoucher(CUSTOMER, { voucherCode: 'SALE10' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(build().service.checkVoucher(CUSTOMER, { voucherCode: 'SALE10', variantIds: ['64b000000000000000000009'] }))
      .rejects.toBeInstanceOf(BadRequestException);
  });
});
