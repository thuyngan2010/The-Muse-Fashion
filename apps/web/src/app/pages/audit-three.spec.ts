import { Injector, runInInjectionContext, signal, ɵEffectScheduler, ɵChangeDetectionScheduler } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { EMPTY, Subject, of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProductReview, ReviewMutationResult, UserSummary } from '@fashion/contracts';
import { ApiService } from '../services/api.service';
import { AuthService } from '../services/auth.service';
import { CartService } from '../services/cart.service';
import { ToastService } from '../services/toast.service';
import { salesReportDateRange, vietnamDate } from '../services/report-date-range';
import { AdminReportsPage } from './admin/admin-reports.page';
import { AdminVouchersPage } from './admin/admin-vouchers.page';
import { ProductPage } from './product.page';

const contexts = new WeakMap<object, { flush: () => void; setUser: (user: Partial<UserSummary> | null) => void }>();
function make<T extends object>(Type: new () => T, api: unknown, user: Partial<UserSummary> | null = null) {
  const currentUser = signal(user);
  const effects = new Set<any>();
  const scheduler = { add: (effect: any) => effects.add(effect), schedule: (effect: any) => effects.add(effect),
    remove: (effect: any) => effects.delete(effect), flush: () => {
      while (effects.size) { const queued = [...effects]; effects.clear(); for (const effect of queued) if (effect.dirty) effect.run(); }
    } };
  const injector = Injector.create({ providers: [
    { provide: ApiService, useValue: api },
    { provide: AuthService, useValue: { currentUser } },
    { provide: ɵEffectScheduler, useValue: scheduler },
    { provide: ɵChangeDetectionScheduler, useValue: { notify: () => {}, runningTick: false } },
    { provide: CartService, useValue: {} }, { provide: ActivatedRoute, useValue: {} },
    { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
  ] });
  const page = runInInjectionContext(injector, () => new Type());
  contexts.set(page, { flush: scheduler.flush, setUser: next => currentUser.set(next) });
  return page;
}
function flush(page: object): void { contexts.get(page)!.flush(); }
afterEach(() => vi.useRealTimers());

describe('Third audit frontend regressions', () => {
  it('includes both Vietnam date boundaries and accepts a single selected day', () => {
    const range = salesReportDateRange('2026-10-29', '2026-10-29');
    expect(range).toEqual({ from: '2026-10-28T17:00:00.000Z', to: '2026-10-29T17:00:00.000Z' });
    const inside = (date: string) => date >= range.from && date < range.to;
    expect(inside('2026-10-28T17:00:00.000Z')).toBe(true);
    expect(inside('2026-10-29T16:59:59.999Z')).toBe(true);
    expect(inside('2026-10-29T17:00:00.000Z')).toBe(false);
    expect(salesReportDateRange('2028-02-29', '2028-02-29').to).toBe('2028-02-29T17:00:00.000Z');
  });

  it('uses the current Vietnam calendar day before 07:00 and rejects invalid ranges before HTTP', () => {
    const reference = new Date('2026-10-29T00:30:00+07:00');
    expect(vietnamDate(reference)).toBe('2026-10-29');
    vi.useFakeTimers(); vi.setSystemTime(reference);
    const api = { adminGetSalesReport: vi.fn(() => EMPTY) };
    const page = make(AdminReportsPage, api); page.ngOnInit();
    expect(page.toDate).toBe('2026-10-29');
    expect(api.adminGetSalesReport.mock.calls[0][1]).toBe('2026-10-29T17:00:00.000Z');
    page.fromDate = '2026-10-30'; page.toDate = '2026-10-29'; page.loadReport();
    expect(api.adminGetSalesReport).toHaveBeenCalledTimes(1);
    expect(page.error()).toBeTruthy(); expect(page.loading()).toBe(false);
    expect(() => salesReportDateRange('2026-02-30', '2026-03-01')).toThrow();
    page.ngOnDestroy();
  });

  it('ignores older sales responses when filters change', () => {
    const old = new Subject<any>(), current = new Subject<any>();
    const api = { adminGetSalesReport: vi.fn().mockReturnValueOnce(old).mockReturnValueOnce(current) };
    const page = make(AdminReportsPage, api); page.fromDate = '2026-10-28'; page.toDate = '2026-10-29';
    page.loadReport(); page.loadReport(); current.next({ paidRevenue: 2 }); old.next({ paidRevenue: 1 });
    expect(page.report()?.paidRevenue).toBe(2); page.ngOnDestroy();
    current.next({ paidRevenue: 3 }); expect(page.report()?.paidRevenue).toBe(2);
  });

  it('sends explicit null to remove a voucher cap and preserves a zero cap', () => {
    const api = { adminUpdateVoucher: vi.fn(() => EMPTY) };
    const page = make(AdminVouchersPage, api);
    page.openEditModal({ id: 'voucher', code: 'TEST', type: 'PERCENT', value: 10, minimumSubtotal: 0,
      maxDiscount: 50000, usageLimit: 100, usedCount: 8, status: 'ACTIVE', validFrom: '2026-10-01', validTo: '2026-12-01' });
    page.formMaxDiscount = null; page.saveVoucher();
    expect(JSON.parse(JSON.stringify(api.adminUpdateVoucher.mock.calls[0][1]))).toHaveProperty('maxDiscount', null);
    page.formMaxDiscount = 0; page.saveVoucher();
    expect(api.adminUpdateVoucher.mock.calls[1][1]).toHaveProperty('maxDiscount', 0);
  });

  it('manages only reviews returned by the private owner lookup and preserves attached photos on edit', () => {
    const review: ProductReview = { id: 'review', productId: 'product', stars: 5, content: 'Original' };
    const owned: ReviewMutationResult = { id: 'review', orderItemId: 'line', customerId: 'owner',
      stars: 5, content: 'Original', mediaIds: ['photo'], mediaUrls: [], status: 'PUBLIC' };
    const api = { listReviews: vi.fn(() => of({ items: [review], total: 1 })),
      myReviewsByIds: vi.fn(() => of({ items: [owned] })), updateReview: vi.fn(() => EMPTY), deleteReview: vi.fn(() => EMPTY) };
    const user = { id: 'owner', role: 'CUSTOMER' as const };
    const page = make(ProductPage, api, user); page.loadReviews('product'); flush(page);
    expect(api.myReviewsByIds).toHaveBeenCalledWith(['review']);
    expect(page.canManageReview(review)).toBe(true);
    expect(page.canManageReview({ ...review, id: 'someone-else' })).toBe(false);
    page.openEditReview(review); page.editReviewContent = 'Updated'; page.saveEditReview();
    expect(api.updateReview).toHaveBeenCalledWith('review', { orderItemId: 'line', stars: 5, content: 'Updated', mediaIds: ['photo'] });
    user.role = 'ADMIN' as any;
    expect(page.canManageReview(review)).toBe(false);
    page.openEditReview(review); page.deleteReview(review);
    expect(api.deleteReview).not.toHaveBeenCalled(); page.ngOnDestroy();
  });

  it('does not request private ownership for guests or admin and cancels stale owner lookups', () => {
    const review = { id: 'review', productId: 'product', stars: 5, content: 'Original' };
    const old = new Subject<any>(), current = new Subject<any>();
    const api = { listReviews: vi.fn(() => of({ items: [review], total: 1 })),
      myReviewsByIds: vi.fn().mockReturnValueOnce(old).mockReturnValueOnce(current) };
    make(ProductPage, api).loadReviews('product');
    make(ProductPage, api, { id: 'admin', role: 'ADMIN' }).loadReviews('product');
    expect(api.myReviewsByIds).not.toHaveBeenCalled();
    const page = make(ProductPage, api, { id: 'owner', role: 'CUSTOMER' });
    page.loadReviews('product'); flush(page); contexts.get(page)!.setUser({ id: 'owner', role: 'CUSTOMER' }); flush(page);
    old.next({ items: [{ id: 'review', customerId: 'owner' }] }); expect(page.ownedReviews()).toEqual({});
    page.ngOnDestroy(); current.next({ items: [{ id: 'review', customerId: 'owner' }] });
    expect(page.ownedReviews()).toEqual({});
  });

  it('loads ownership when auth restoration finishes after public reviews and clears it on logout', () => {
    const owned = { id: 'review', customerId: 'owner' };
    const review = { id: 'review', productId: 'product', stars: 5, content: 'Review' };
    const api = { listReviews: () => of({ items: [review], total: 1 }), myReviewsByIds: vi.fn(() => of({ items: [owned] })) };
    const page = make(ProductPage, api); page.loadReviews('product'); flush(page);
    expect(api.myReviewsByIds).not.toHaveBeenCalled();
    contexts.get(page)!.setUser({ id: 'owner', role: 'CUSTOMER' }); flush(page);
    expect(page.canManageReview(review)).toBe(true);
    contexts.get(page)!.setUser(null); flush(page);
    expect(page.canManageReview(review)).toBe(false); expect(page.ownedReviews()).toEqual({});
    page.ngOnDestroy();
  });
});
