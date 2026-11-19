import { Injector, runInInjectionContext } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';
import { AdminRefundsPage } from './admin-refunds.page';

function makePage(api: Record<string, unknown>) {
  const injector = Injector.create({ providers: [
    { provide: ApiService, useValue: api },
    { provide: AuthService, useValue: { isAdmin: () => true, currentUser: () => ({ id: 'admin' }), can: () => true, canGlobal: () => true } },
    { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } },
    { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: new Map() } } },
  ] });
  return runInInjectionContext(injector, () => new AdminRefundsPage());
}

describe('Refund evidence can be removed before saving', () => {
  it('"Xóa ảnh" drops the uploaded evidence and recreates the file input', () => {
    const page = makePage({ uploadImage: vi.fn(() => of({ id: 'm1', objectKey: 'refund_evidence/admin/a.png' })) });
    const file = new File(['x'], 'chung-tu.png', { type: 'image/png' });
    page.uploadEvidence({ target: { files: [file] } } as unknown as Event);
    expect(page.evidenceObjectKey()).toBe('refund_evidence/admin/a.png');
    expect(page.evidenceFileName()).toBe('chung-tu.png');
    const version = page.evidenceInputVersion();
    page.clearEvidence();
    expect(page.evidenceObjectKey()).toBe('');
    expect(page.evidenceFileName()).toBe('');
    expect(page.evidenceInputVersion()).toBe(version + 1);
  });

  it('opening the review drawer again starts without the previous evidence', () => {
    const ev = { id: 'e1', resolution: 'UNMATCHED', transferType: 'in', transferAmount: 1000 };
    const page = makePage({ uploadImage: vi.fn(() => of({ id: 'm1', objectKey: 'k1' })), adminGetPaymentEvent: vi.fn(() => of(ev)) });
    page.uploadEvidence({ target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } } as unknown as Event);
    page.openReviewEventModal(ev as never);
    expect(page.evidenceObjectKey()).toBe('');
    expect(page.evidenceFileName()).toBe('');
  });
});
