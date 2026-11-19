import { Injector, runInInjectionContext } from '@angular/core';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';
import { AdminRefundsPage } from './admin-refunds.page';

function openPage(query: Record<string, string> = {}) {
  const api = {
    adminListRefunds: vi.fn(() => of({ items: [], total: 3, page: 1, limit: 20 })),
    adminListPaymentEvents: vi.fn(() => of({ items: [{ id: 'e1' }, { id: 'e2' }], total: 2, page: 1, limit: 20 })),
    listPayments: vi.fn(() => of({ items: [], total: 0, page: 1, limit: 50 })),
  };
  const injector = Injector.create({ providers: [
    { provide: ApiService, useValue: api },
    { provide: AuthService, useValue: { isAdmin: () => true, currentUser: () => ({ id: 'admin' }), can: () => true, canGlobal: () => true } },
    { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } },
    { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(query) } } },
  ] });
  const page = runInInjectionContext(injector, () => new AdminRefundsPage());
  page.ngOnInit();
  return { page, api };
}

describe('Số đếm tab Hoàn tiền / Sự kiện thanh toán khi mở trang', () => {
  it('fills both tab counts right away while the refunds tab is shown', () => {
    const { page } = openPage();
    expect(page.activeTab()).toBe('refunds');
    expect(page.pagination.total()).toBe(3);
    expect(page.eventPagination.total()).toBe(2);
  });

  it('opening straight on the events tab loads the events only once', () => {
    const { page, api } = openPage({ tab: 'events' });
    expect(page.activeTab()).toBe('events');
    expect(page.eventPagination.total()).toBe(2);
    expect(page.pagination.total()).toBe(3);
    const listCalls = (api.adminListPaymentEvents.mock.calls as unknown[][]).filter((args) => args[1] !== 1);
    expect(listCalls).toHaveLength(1);
  });
});
