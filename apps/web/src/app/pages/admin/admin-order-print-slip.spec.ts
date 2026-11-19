import { readFileSync } from 'node:fs';
import { Injector, runInInjectionContext } from '@angular/core';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Order } from '@fashion/contracts';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';
import { AdminOrdersPage } from './admin-orders.page';

function makePage() {
  const injector = Injector.create({ providers: [
    { provide: ApiService, useValue: {} },
    { provide: AuthService, useValue: { isAdmin: () => true, can: () => true, canGlobal: () => true, currentUser: () => ({ id: 'admin' }) } },
    { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } },
    { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({}) }, queryParamMap: of(convertToParamMap({})) } },
    { provide: Router, useValue: { navigate: vi.fn() } },
  ] });
  return runInInjectionContext(injector, () => new AdminOrdersPage());
}

afterEach(() => vi.unstubAllGlobals());

describe('In phiếu đóng gói với đơn đã hủy', () => {
  it('the button is disabled for a cancelled order', () => {
    const source = readFileSync(new URL('./admin-orders.page.ts', import.meta.url), 'utf8');
    expect(source).toContain(`[disabled]="d.state === 'CANCELLED'"`);
  });

  it('printSlip does nothing for a cancelled order', () => {
    const createElement = vi.fn();
    vi.stubGlobal('document', { createElement, body: { appendChild: vi.fn() } });
    const page = makePage();
    page.detail.set({ id: 'o1', code: 'ABC', state: 'CANCELLED', items: [] } as unknown as Order);
    page.printSlip();
    expect(createElement).not.toHaveBeenCalled();
  });
});
