import { Injector, runInInjectionContext } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { EMPTY, Subject, of, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiService } from '../services/api.service';
import { CartService } from '../services/cart.service';
import { ToastService } from '../services/toast.service';
import { CheckoutPage } from './checkout.page';
import { PaymentPage } from './payment.page';
import { CatalogPage } from './catalog.page';

function make<T>(type: new () => T, api: unknown, extra: any[] = []) {
  const injector = Injector.create({ providers: [
    { provide: ApiService, useValue: api }, { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } },
    { provide: Router, useValue: { navigate: vi.fn() } }, { provide: CartService, useValue: { resetAfterCheckout: vi.fn() } },
    { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => 'order-id' } } } }, ...extra,
  ] });
  return runInInjectionContext(injector, () => new type());
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('Second audit FE regressions', () => {
  it('reuses the persisted quote/key after an unknown response and reload', () => {
    const storage = new Map<string, string>();
    vi.stubGlobal('sessionStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) });
    const createOrder = vi.fn().mockReturnValueOnce(throwError(() => ({ status: 0 }))).mockReturnValueOnce(of({ id: 'committed-order' }));
    const api = { createOrder, listAddresses: vi.fn() };
    const page = make(CheckoutPage, api);
    page.quote.set({ id: 'quote-id', subtotal: 10, shippingFee: 0, voucherDiscount: 0, payableTotal: 10, expiresAt: new Date(Date.now() + 60000).toISOString() });
    page.placeOrder(); expect(page.pendingOrder()).not.toBeNull(); const key = createOrder.mock.calls[0][1]; page.ngOnDestroy();
    const reloaded = make(CheckoutPage, api); reloaded.ngOnInit();
    expect(createOrder).toHaveBeenLastCalledWith({ quoteId: 'quote-id' }, key);
    expect(api.listAddresses).not.toHaveBeenCalled(); expect(reloaded.pendingOrder()).toBeNull(); expect(storage.size).toBe(0); reloaded.ngOnDestroy();
  });

  it('cancels stale catalog requests and requests still running when the page is destroyed', () => {
    const old = new Subject<any>(), recent = new Subject<any>(); let calls = 0;
    const page = make(CatalogPage, { products: () => ++calls === 1 ? old : recent });
    page.loadProducts(); page.loadProducts(); recent.next({ items: [{ id: 'recent' }], total: 1 }); old.next({ items: [{ id: 'old' }], total: 1 });
    expect(page.products()[0].id).toBe('recent'); page.ngOnDestroy(); recent.next({ items: [{ id: 'after-destroy' }], total: 1 });
    expect(page.products()[0].id).toBe('recent');
  });

  it('removes the exact visibility callback and cancels HTTP work on payment-page destroy', () => {
    vi.useFakeTimers();
    const addEventListener = vi.fn(), removeEventListener = vi.fn();
    vi.stubGlobal('document', { hidden: false, addEventListener, removeEventListener });
    const api = { latestPaymentForOrder: vi.fn(() => EMPTY), getPayment: vi.fn() };
    const page = make(PaymentPage, api); page.ngOnInit(); const callback = addEventListener.mock.calls[0][1];
    page.ngOnDestroy(); expect(removeEventListener).toHaveBeenCalledWith('visibilitychange', callback);
    callback(); vi.advanceTimersByTime(60000); expect(api.getPayment).not.toHaveBeenCalled();
  });
});
