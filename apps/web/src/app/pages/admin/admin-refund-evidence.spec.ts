import { readFileSync } from 'node:fs';
import { Injector, runInInjectionContext } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';
import { AdminRefundsPage, reviewErrorText } from './admin-refunds.page';

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

describe('Payment event review form tells what is missing', () => {
  it('lists bank reference, 10-character note and evidence, and clears once filled', () => {
    const page = makePage({ uploadImage: vi.fn(() => of({ id: 'm1', objectKey: 'k1' })) });
    page.eventReviewDecision = 'OUTGOING_RECONCILED';
    page.eventReviewBankReference = 'ab';
    page.eventReviewNote = 'ngắn';
    expect(page.reviewMissing()).toEqual([
      'mã chứng từ ngân hàng (tối thiểu 3 ký tự)', 'ghi chú kiểm toán tối thiểu 10 ký tự (hiện có 4)', 'ảnh chứng từ kiểm toán',
    ]);
    page.eventReviewBankReference = 'FT2611180001';
    page.eventReviewNote = 'Đã đối chiếu sao kê ngân hàng';
    page.uploadEvidence({ target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } } as unknown as Event);
    expect(page.reviewMissing()).toEqual([]);
  });

  it('explains the API rejection in Vietnamese', () => {
    expect(reviewErrorText('Merchant funds cannot be closed without a recorded resolution')).toContain('tiền đã vào tài khoản cửa hàng');
    expect(reviewErrorText('Something else')).toBe('Something else');
  });
});

describe('Refund proposal without any paid order', () => {
  it('explains why there is no payment to choose', () => {
    const source = readFileSync(new URL('./admin-refunds.page.ts', import.meta.url), 'utf8');
    const notice = source.indexOf('@if (succeededPayments().length === 0)');
    expect(notice).toBeGreaterThan(source.indexOf('<datalist id="succeeded-payments">'));
    expect(source).toContain('Chưa có giao dịch thanh toán thành công nào để hoàn tiền.');
  });
});
