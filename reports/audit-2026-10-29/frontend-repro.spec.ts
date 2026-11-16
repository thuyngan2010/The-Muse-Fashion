// Audit diagnostics: assertions capture the current defects, not desired contracts.
import 'reflect-metadata';
import '@angular/compiler';
import { Injector, runInInjectionContext } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { EMPTY, of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiService } from '../../apps/web/src/app/services/api.service';
import { AuthService } from '../../apps/web/src/app/services/auth.service';
import { CartService } from '../../apps/web/src/app/services/cart.service';
import { ToastService } from '../../apps/web/src/app/services/toast.service';
import { AdminReportsPage } from '../../apps/web/src/app/pages/admin/admin-reports.page';
import { AdminVouchersPage } from '../../apps/web/src/app/pages/admin/admin-vouchers.page';
import { ProductPage } from '../../apps/web/src/app/pages/product.page';
import { VoucherService } from '../../apps/api/src/modules/commerce/voucher.service';
import { ReviewsService } from '../../apps/api/src/modules/community/reviews.service';
import { resolveSalesReportRange } from '../../apps/api/src/modules/admin/report-range.util';

vi.hoisted(() => { vi.stubGlobal('window', {}); });

function make<T>(Type: new () => T, api: any, auth: any = {}) {
  const injector = Injector.create({ providers: [
    { provide: ApiService, useValue: api }, { provide: AuthService, useValue: auth },
    { provide: CartService, useValue: {} },
    { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } },
    { provide: Router, useValue: {} }, { provide: ActivatedRoute, useValue: {} },
  ] });
  return runInInjectionContext(injector, () => new Type());
}

function query(value: any) {
  const chain: any = { exec: async () => value };
  for (const name of ['sort', 'skip', 'limit', 'lean']) chain[name] = () => chain;
  return chain;
}

afterEach(() => { vi.useRealTimers(); });

describe('2026-10-29 frontend audit reproductions', () => {
  it('default sales report ends at 07:00 Vietnam time, excluding today from 07:00 onwards', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-29T14:00:00+07:00'));
    const api = { adminGetSalesReport: vi.fn(() => EMPTY) };
    const page = make(AdminReportsPage, api);
    page.ngOnInit();
    const [from, to] = api.adminGetSalesReport.mock.calls[0] as unknown as [string, string];
    expect(to).toBe('2026-10-29');
    const range = resolveSalesReportRange(from, to);
    const paidAt = new Date('2026-10-29T10:00:00+07:00');
    expect(paidAt >= range.from && paidAt < range.to).toBe(false);
    expect(range.to.toISOString()).toBe('2026-10-29T00:00:00.000Z');
  });

  it('same-day sales selection is rejected by the API range parser', () => {
    const api = { adminGetSalesReport: vi.fn(() => EMPTY) };
    const page = make(AdminReportsPage, api);
    page.fromDate = '2026-10-29'; page.toDate = '2026-10-29';
    page.loadReport();
    const [from, to] = api.adminGetSalesReport.mock.calls[0] as unknown as [string, string];
    expect(() => resolveSalesReportRange(from, to)).toThrow('Invalid report date range');
  });

  it('clearing maximum voucher discount drops the field, preserving the previous cap', () => {
    const api = { adminUpdateVoucher: vi.fn(() => EMPTY) };
    const page = make(AdminVouchersPage, api);
    page.openEditModal({ id: 'voucher', code: 'TEST10', type: 'PERCENT', value: 10,
      minimumSubtotal: 0, maxDiscount: 50000, usageLimit: 100,
      validFrom: '2026-10-01T00:00:00.000Z', validTo: '2026-11-01T00:00:00.000Z', status: 'ACTIVE' });
    page.formMaxDiscount = null;
    page.saveVoucher();
    const payload = api.adminUpdateVoucher.mock.calls[0][1];
    expect(JSON.parse(JSON.stringify(payload))).not.toHaveProperty('maxDiscount');
  });

  it('voucher API usedCount never reaches the usageCount field shown in the table', async () => {
    const service = new VoucherService({ find: () => query([{ _id: 'voucher', code: 'TEST10', type: 'PERCENT',
      value: 10, minimumSubtotal: 0, usageLimit: 10, usedCount: 8,
      validFrom: new Date('2026-10-01'), validTo: new Date('2026-11-01'), status: 'ACTIVE' }]) } as any, {} as any, {} as any);
    const response = await service.list();
    const page = make(AdminVouchersPage, { adminListVouchers: () => of(response) });
    page.loadVouchers();
    expect(response.items[0].usedCount).toBe(8);
    expect(page.vouchers()[0].usageCount || 0).toBe(0);
  });

  it('public product review shape hides owner management controls even for its customer', async () => {
    const customerId = '657000000000000000000001';
    const service = new ReviewsService({ find: () => query([{ _id: 'review',
      customerId, productId: '657000000000000000000002', orderItemId: '657000000000000000000003',
      stars: 5, content: 'Review', mediaIds: [] }]), countDocuments: () => query(1) } as any,
      {} as any, {} as any, {} as any);
    const response = await service.listPublic('657000000000000000000002');
    const page = make(ProductPage, {}, { currentUser: () => ({ id: customerId }), isAdmin: () => false });
    expect(page.canManageReview(response.items[0])).toBe(false);
    expect(response.items[0]).not.toHaveProperty('orderItemId');
  });
});
