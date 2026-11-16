import { Injector, runInInjectionContext } from '@angular/core';
import { Router } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CheckoutQuote } from '@fashion/contracts';
import { CheckoutPage } from './checkout.page';
import { ApiService } from '../services/api.service';
import { CartService } from '../services/cart.service';
import { ToastService } from '../services/toast.service';

const initial: CheckoutQuote = {
  id: 'initial', subtotal: 580_000, shippingFee: 30_000, voucherDiscount: 0,
  payableTotal: 610_000, expiresAt: new Date(Date.now() + 600_000).toISOString(),
};

describe('Checkout quote recovery', () => {
  let page: CheckoutPage;
  let api: { createQuote: ReturnType<typeof vi.fn>; createOrder: ReturnType<typeof vi.fn> };
  let toast: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn>; warning: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    api = { createQuote: vi.fn(() => of(initial)), createOrder: vi.fn(() => of({ id: 'order' })) };
    toast = { success: vi.fn(), error: vi.fn(), warning: vi.fn() };
    const injector = Injector.create({ providers: [
      { provide: ApiService, useValue: api },
      { provide: CartService, useValue: { resetAfterCheckout: vi.fn() } },
      { provide: ToastService, useValue: toast },
      { provide: Router, useValue: { navigate: vi.fn() } },
    ] });
    page = runInInjectionContext(injector, () => new CheckoutPage());
    page.selectedAddressId.set('address-a');
    page.applyQuote();
    api.createQuote.mockClear();
  });

  afterEach(() => page.ngOnDestroy());

  it.each(['VOUCHER_INVALID', 'VOUCHER_DISABLED', 'VOUCHER_EXPIRED', 'VOUCHER_EXHAUSTED', 'VOUCHER_MINIMUM_NOT_MET'])(
    'recovers %s with a fresh server quote without the voucher', (code) => {
      const fallback = new Subject<CheckoutQuote>();
      api.createQuote.mockReturnValueOnce(throwError(() => ({ status: 400, error: { code } })))
        .mockReturnValueOnce(fallback);
      page.voucherCode = ' invalidvoucher99 ';
      page.applyQuote();
      expect(page.quote()).toBe(initial);
      expect(page.voucherError()).not.toBe('');
      expect(page.quoting()).toBe(true);
      page.placeOrder();
      expect(api.createOrder).not.toHaveBeenCalled();
      expect(api.createQuote.mock.calls).toEqual([
        [{ addressId: 'address-a', voucherCode: 'INVALIDVOUCHER99' }], [{ addressId: 'address-a' }],
      ]);
      fallback.next({ ...initial, id: 'fallback' });
      fallback.complete();
      expect(page.appliedVoucherCode()).toBe('');
      expect(page.quoting()).toBe(false);
      expect(page.quote()?.payableTotal).toBe(610_000);
      page.placeOrder();
      expect(api.createOrder).toHaveBeenCalledWith({ quoteId: 'fallback' }, expect.any(String));
      expect(toast.error).not.toHaveBeenCalled();
    },
  );

  it('removes a previous discount when a replacement voucher is rejected', () => {
    api.createQuote.mockReturnValueOnce(of({ ...initial, voucherDiscount: 50_000, payableTotal: 560_000 }));
    page.voucherCode = 'VALID';
    page.applyQuote();
    expect(page.appliedVoucherCode()).toBe('VALID');
    api.createQuote.mockReturnValueOnce(throwError(() => ({ status: 400, error: { code: 'VOUCHER_INVALID' } })))
      .mockReturnValueOnce(of({ ...initial, id: 'undiscounted' }));
    page.voucherCode = 'INVALID';
    page.applyQuote();
    expect(page.appliedVoucherCode()).toBe('');
    expect(page.quote()?.voucherDiscount).toBe(0);
    expect(page.quote()?.payableTotal).toBe(610_000);
  });

  it('does not retry unrelated errors or submit a stale quote', () => {
    api.createQuote.mockReturnValueOnce(throwError(() => ({ status: 503, error: { message: 'Unavailable' } })));
    page.voucherCode = 'PROMO';
    page.applyQuote();
    expect(api.createQuote).toHaveBeenCalledTimes(1);
    expect(page.quote()).toBeNull();
    expect(page.voucherError()).toBe('');
    expect(page.quoteError()).toBe('Unavailable');
    expect(page.quoting()).toBe(false);
    page.placeOrder();
    expect(api.createOrder).not.toHaveBeenCalled();
  });

  it('fails safely if the quote without a voucher also fails', () => {
    api.createQuote.mockReturnValueOnce(throwError(() => ({ status: 400, error: { code: 'VOUCHER_INVALID' } })))
      .mockReturnValueOnce(throwError(() => ({ status: 404, error: { message: 'Address not found' } })));
    page.voucherCode = 'INVALID';
    page.applyQuote();
    expect(page.quote()).toBeNull();
    expect(page.quoting()).toBe(false);
    expect(page.quoteError()).toBe('Address not found');
  });

  it('cancels stale requests when the address changes', () => {
    const old = new Subject<CheckoutQuote>();
    const current = new Subject<CheckoutQuote>();
    api.createQuote.mockReturnValueOnce(old).mockReturnValueOnce(current);
    page.applyQuote();
    page.selectAddress('address-b');
    expect(page.quote()).toBeNull();
    expect(old.observed).toBe(false);
    current.next({ ...initial, id: 'address-b-quote', shippingFee: 40_000, payableTotal: 620_000 });
    old.next({ ...initial, id: 'stale' });
    expect(page.quote()?.id).toBe('address-b-quote');
  });

  it('displays the submitted voucher rather than edits made while loading', () => {
    const pending = new Subject<CheckoutQuote>();
    api.createQuote.mockReturnValueOnce(pending);
    page.voucherCode = 'APPLIED';
    page.applyQuote();
    page.voucherCode = 'DRAFT';
    pending.next({ ...initial, voucherDiscount: 10_000 });
    expect(page.appliedVoucherCode()).toBe('APPLIED');
  });
});
