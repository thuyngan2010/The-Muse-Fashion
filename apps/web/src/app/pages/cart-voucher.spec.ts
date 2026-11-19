import { readFileSync } from 'node:fs';
import { Injector, runInInjectionContext, signal } from '@angular/core';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ApiService } from '../services/api.service';
import { AuthService } from '../services/auth.service';
import { CartService } from '../services/cart.service';
import { ToastService } from '../services/toast.service';
import { CartPage } from './cart.page';
import { CheckoutPage, parseVoucherCode } from './checkout.page';

const A = '64b000000000000000000001';
const B = '64b000000000000000000002';
const item = (variantId: string, unitPrice: number, quantity = 1) => ({ variantId, sku: variantId, productName: variantId, unitPrice, quantity, available: 9 });

function makeCart(api: Record<string, unknown>, authenticated = true) {
  const cart = signal({ items: [item(A, 100_000), item(B, 200_000)], subtotal: 300_000 });
  const navigate = vi.fn();
  const injector = Injector.create({ providers: [
    { provide: ApiService, useValue: { products: () => of({ items: [] }), ...api } },
    { provide: CartService, useValue: { cart, loading: signal(false) } },
    { provide: AuthService, useValue: { isAuthenticated: () => authenticated } },
    { provide: Router, useValue: { navigate } },
  ] });
  const page = runInInjectionContext(injector, () => new CartPage());
  return { page, navigate };
}

describe('Nhập mã ưu đãi ở trang giỏ hàng', () => {
  it('the voucher box is a real, editable input with an apply button', () => {
    const source = readFileSync(new URL('./cart.page.ts', import.meta.url), 'utf8');
    expect(source).toContain('[(ngModel)]="voucherCode"');
    expect(source).not.toContain('placeholder="Nhập tại bước thanh toán" readonly');
    expect(source).toContain('(click)="applyVoucher()"');
  });

  it('checks the code against the ticked items and shows the discount in the total', () => {
    const checkVoucher = vi.fn(() => of({ code: 'SALE10', subtotal: 200_000, voucherDiscount: 20_000 }));
    const { page } = makeCart({ checkVoucher });
    page.toggleItem(B, true);
    page.voucherCode = ' sale10 ';
    page.applyVoucher();
    expect(checkVoucher).toHaveBeenCalledWith({ voucherCode: 'SALE10', variantIds: [B] });
    expect(page.appliedVoucher()?.code).toBe('SALE10');
    expect(page.voucherDiscount()).toBe(20_000);
    expect(page.cartTotal()).toBe(180_000);
  });

  it('stops counting the discount once the ticked items change (until re-checked)', () => {
    const { page } = makeCart({ checkVoucher: () => of({ code: 'SALE10', subtotal: 200_000, voucherDiscount: 20_000 }) });
    page.toggleItem(B, true);
    page.voucherCode = 'SALE10';
    page.applyVoucher();
    page.toggleItem(A, true);
    expect(page.voucherDiscount()).toBe(0);
    expect(page.cartTotal()).toBe(300_000);
  });

  it('shows Vietnamese messages for rejected or unusable codes', () => {
    const checkVoucher = vi.fn(() => throwError(() => ({ status: 400, error: { code: 'VOUCHER_EXPIRED' } })));
    const { page } = makeCart({ checkVoucher });
    page.applyVoucher();
    expect(page.voucherError()).toBe('Vui lòng nhập mã ưu đãi.');
    page.voucherCode = 'OLD';
    page.applyVoucher();
    expect(page.voucherError()).toBe('Tick chọn sản phẩm trước khi áp dụng mã ưu đãi.');
    page.toggleItem(A, true);
    page.applyVoucher();
    expect(page.voucherError()).toBe('Mã ưu đãi đã hết hạn.');
    expect(page.appliedVoucher()).toBeNull();
    expect(page.voucherDiscount()).toBe(0);
  });

  it('asks guests to sign in instead of calling the API', () => {
    const checkVoucher = vi.fn();
    const { page } = makeCart({ checkVoucher }, false);
    page.toggleItem(A, true);
    page.voucherCode = 'SALE10';
    page.applyVoucher();
    expect(checkVoucher).not.toHaveBeenCalled();
    expect(page.voucherError()).toBe('Vui lòng đăng nhập để áp dụng mã ưu đãi.');
  });

  it('carries the applied code to checkout, which pre-fills and applies it', () => {
    const { page, navigate } = makeCart({ checkVoucher: () => of({ code: 'SALE10', subtotal: 200_000, voucherDiscount: 20_000 }) });
    page.toggleItem(B, true);
    page.voucherCode = 'SALE10';
    page.applyVoucher();
    page.goToCheckout();
    expect(navigate).toHaveBeenCalledWith(['/checkout'], { queryParams: { items: B, voucher: 'SALE10' } });

    expect(parseVoucherCode(' sale10 ')).toBe('SALE10');
    expect(parseVoucherCode('')).toBe('');
    expect(parseVoucherCode('X'.repeat(51))).toBe('');
    const createQuote = vi.fn(() => of({ id: 'q', subtotal: 200_000, shippingFee: 0, voucherDiscount: 20_000, payableTotal: 180_000, expiresAt: '2099-01-01T00:00:00.000Z' }));
    const injector = Injector.create({ providers: [
      { provide: ApiService, useValue: { createQuote } },
      { provide: CartService, useValue: { cart: signal({ items: [item(B, 200_000)], subtotal: 200_000 }), resetAfterCheckout: vi.fn() } },
      { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } },
      { provide: Router, useValue: { navigate: vi.fn() } },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({ items: B, voucher: 'SALE10' }) } } },
    ] });
    const checkout = runInInjectionContext(injector, () => new CheckoutPage());
    expect(checkout.voucherCode).toBe('SALE10');
    checkout.selectedAddressId.set('address-a');
    checkout.applyQuote();
    expect(createQuote).toHaveBeenCalledWith({ addressId: 'address-a', voucherCode: 'SALE10', variantIds: [B] });
    expect(checkout.appliedVoucherCode()).toBe('SALE10');
    checkout.ngOnDestroy();
  });
});
