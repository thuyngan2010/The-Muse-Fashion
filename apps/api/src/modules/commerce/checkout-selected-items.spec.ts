import { describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { CheckoutService } from './checkout.service.js';
import { selectCartLines } from './order.types.js';

const A = '64b000000000000000000001';
const B = '64b000000000000000000002';
const line = (variantId: string, quantity: number, unitPrice: number) => ({ variantId, quantity, unitPrice });

describe('selectCartLines (thanh toán sản phẩm được tick)', () => {
  it('returns the whole cart when nothing is specified', () => {
    expect(selectCartLines([line(A, 1, 100), line(B, 2, 50)])).toEqual({ items: [line(A, 1, 100), line(B, 2, 50)], subtotal: 200 });
  });

  it('keeps only the selected lines and sums their subtotal', () => {
    expect(selectCartLines([line(A, 1, 100), line(B, 2, 50)], [B])).toEqual({ items: [line(B, 2, 50)], subtotal: 100 });
  });

  it('rejects a selection that is no longer in the cart', () => {
    expect(selectCartLines([line(A, 1, 100)], [A, B])).toBeNull();
    expect(selectCartLines([line(A, 1, 100)], [B])).toBeNull();
  });
});

describe('CheckoutService.createQuote with variantIds', () => {
  function build() {
    const quotes = { create: vi.fn().mockResolvedValue(undefined) };
    const carts = { getCart: vi.fn().mockResolvedValue({ items: [line(A, 1, 300_000), line(B, 2, 100_000)], subtotal: 500_000 }) };
    const pricing = {
      getSettings: vi.fn().mockResolvedValue({}),
      resolveVoucher: vi.fn().mockResolvedValue({ discount: 0 }),
      totals: vi.fn((subtotal: number) => ({ subtotal, shippingFee: 0, voucherDiscount: 0, payableTotal: subtotal })),
    };
    const addresses = { findOne: vi.fn().mockReturnValue({ lean: () => ({ exec: async () => ({ _id: 'addr' }) }) }) };
    const service = new CheckoutService(carts as never, pricing as never, addresses as never, quotes as never);
    return { service, quotes, pricing };
  }

  it('prices and stores only the ticked items', async () => {
    const { service, quotes, pricing } = build();
    const quote = await service.createQuote('64b0000000000000000000ff', { addressId: '64b0000000000000000000aa', variantIds: [B] });
    expect(pricing.resolveVoucher).toHaveBeenCalledWith(undefined, 200_000);
    expect(quote.payableTotal).toBe(200_000);
    expect(quotes.create.mock.calls[0][0]).toMatchObject({ cartItems: [{ variantId: B, quantity: 2 }], cartFingerprint: `${B}:2`, subtotal: 200_000 });
  });

  it('still quotes the whole cart when no selection is sent', async () => {
    const { service, quotes } = build();
    await service.createQuote('64b0000000000000000000ff', { addressId: '64b0000000000000000000aa' });
    expect(quotes.create.mock.calls[0][0]).toMatchObject({ subtotal: 500_000 });
  });

  it('answers 400 when a selected item is not in the cart', async () => {
    const { service } = build();
    await expect(service.createQuote('64b0000000000000000000ff', { addressId: '64b0000000000000000000aa', variantIds: ['64b000000000000000000009'] }))
      .rejects.toBeInstanceOf(BadRequestException);
  });
});
