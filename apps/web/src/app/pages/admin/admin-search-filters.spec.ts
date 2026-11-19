import { Injector, runInInjectionContext } from '@angular/core';
import { ActivatedRoute, Router, convertToParamMap, type ParamMap } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';
import { AdminOrdersPage } from './admin-orders.page';

const auth = { isAdmin: () => false, isStaff: () => true, currentUser: () => ({ id: 'staff' }), can: () => true, canGlobal: () => true };

function setup<T extends { ngOnInit(): void; ngOnDestroy(): void }>(Type: new () => T, api: Record<string, unknown>) {
  const params = new BehaviorSubject<ParamMap>(convertToParamMap({}));
  const injector = Injector.create({ providers: [
    { provide: ApiService, useValue: api },
    { provide: AuthService, useValue: auth },
    { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } },
    { provide: ActivatedRoute, useValue: { queryParamMap: params, snapshot: { queryParamMap: convertToParamMap({}) } } },
    { provide: Router, useValue: { navigate: vi.fn() } },
  ] });
  const page = runInInjectionContext(injector, () => new Type());
  page.ngOnInit();
  return { page, params };
}

describe('Admin orders search', () => {
  it('reloads the list when the typed keyword reaches the URL', () => {
    const adminListOrders = vi.fn(() => of({ items: [], total: 0, page: 1, limit: 20 }));
    const { page, params } = setup(AdminOrdersPage, { adminListOrders });
    const listCalls = () => adminListOrders.mock.calls.filter((c) => (c as unknown[])[2] !== 1);
    expect(listCalls()).toHaveLength(1);
    page.onSearch('FCMWMCIJRIB3C82D2CD5C0');
    params.next(convertToParamMap({ q: 'FCMWMCIJRIB3C82D2CD5C0' }));
    expect(listCalls()).toHaveLength(2);
    expect(listCalls()[1]).toEqual([undefined, 1, 20, { q: 'FCMWMCIJRIB3C82D2CD5C0', customerId: undefined }]);
    page.ngOnDestroy();
  });
});
