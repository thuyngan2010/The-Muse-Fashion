import { readFileSync } from 'node:fs';
import { Injector, runInInjectionContext, signal } from '@angular/core';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ApiService } from '../services/api.service';
import { CartService } from '../services/cart.service';
import { ToastService } from '../services/toast.service';
import { CheckoutPage, parseSelectedItems } from './checkout.page';

const A = '64b000000000000000000001';
const B = '64b000000000000000000002';
const item = (variantId: string, unitPrice: number, quantity = 1) => ({ variantId, sku: variantId, productName: variantId, unitPrice, quantity, available: 9 });

describe('Thanh toán chỉ các sản phẩm được tick', () => {
  it('reads valid, unique variant ids from ?items=', () => {
    expect(parseSelectedItems(`${A},${B},${A}, bad`)).toEqual([A, B]);
    expect(parseSelectedItems('')).toBeNull();
    expect(parseSelectedItems(null)).toBeNull();
  });

  it('checkout lists and quotes only the selected cart lines', () => {
    const api = { createQuote: vi.fn(() => of({ id: 'q', subtotal: 200, shippingFee: 0, voucherDiscount: 0, payableTotal: 200, expiresAt: '2099-01-01T00:00:00.000Z' })) };
    const cart = signal({ items: [item(A, 100), item(B, 200)], subtotal: 300 });
    const injector = Injector.create({ providers: [
      { provide: ApiService, useValue: api },
      { provide: CartService, useValue: { cart, resetAfterCheckout: vi.fn() } },
      { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } },
      { provide: Router, useValue: { navigate: vi.fn() } },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({ items: B }) } } },
    ] });
    const page = runInInjectionContext(injector, () => new CheckoutPage());
    expect(page.orderItems().map((i) => i.variantId)).toEqual([B]);
    page.selectedAddressId.set('address-a');
    page.applyQuote();
    expect(api.createQuote).toHaveBeenCalledWith({ addressId: 'address-a', voucherCode: undefined, variantIds: [B] });
    page.ngOnDestroy();
  });

  it('cart summary totals only ticked items and blocks checkout when nothing is ticked', () => {
    const cartPage = readFileSync(new URL('./cart.page.ts', import.meta.url), 'utf8');
    expect(cartPage).toContain("<strong>{{ selectedSubtotal() | currency:'VND':'symbol':'1.0-0' }}</strong>");
    expect(cartPage).not.toContain('cart.subtotal() | currency');
    expect(cartPage).toContain('[disabled]="selectedItems().length === 0" (click)="goToCheckout()"');
    expect(cartPage).toContain("this.router.navigate(['/checkout'], { queryParams });");
  });
});
