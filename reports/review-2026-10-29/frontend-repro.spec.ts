import { Injector, runInInjectionContext } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { of, EMPTY } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ApiService } from '../../apps/web/src/app/services/api.service';
import { AuthService } from '../../apps/web/src/app/services/auth.service';
import { CartService } from '../../apps/web/src/app/services/cart.service';
import { ToastService } from '../../apps/web/src/app/services/toast.service';
import { CommunityPage } from '../../apps/web/src/app/pages/community.page';
import { OrderDetailPage } from '../../apps/web/src/app/pages/order-detail.page';
import { AdminVouchersPage } from '../../apps/web/src/app/pages/admin/admin-vouchers.page';
import { AiTryOnPage } from '../../apps/web/src/app/pages/ai-try-on.page';

function make<T>(Type: new () => T, api: unknown): T {
  const injector = Injector.create({ providers: [
    { provide: ApiService, useValue: api },
    { provide: AuthService, useValue: { isCustomer: () => true } },
    { provide: CartService, useValue: {} },
    { provide: ActivatedRoute, useValue: {} },
    { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } },
  ] });
  return runInInjectionContext(injector, () => new Type());
}

describe('Read-only audit: reproduce current frontend defects', () => {
  it('reproduces old community media ID being sent after replacing an image and editing a second time', () => {
    const oldPost: any = { id: 'post', caption: 'First', mediaIds: ['old-photo'], mediaUrls: ['old-url'] };
    const api = { updatePost: vi.fn(() => of({ ...oldPost, caption: 'Updated', mediaIds: ['new-photo'], mediaUrls: ['new-url'] })) };
    const page = make(CommunityPage, api);
    page.posts.set([oldPost]);
    page.openEditPost(oldPost); page.editPostMediaId.set('new-photo'); page.submitEditPost();
    expect(page.posts()[0].mediaUrls).toEqual(['new-url']);
    page.openEditPost(page.posts()[0]); page.editPostCaption = 'Second edit'; page.submitEditPost();
    expect(api.updatePost.mock.calls[1][1].mediaIds).toEqual(['old-photo']);
  });

  it('reproduces review photo IDs being discarded when editing from order detail', () => {
    const api = {
      getOrder: vi.fn(() => of({ id: 'order', state: 'DELIVERED' })),
      myOrderReviews: vi.fn(() => of({ items: [{ id: 'review', orderItemId: 'line', stars: 5, content: 'Review', mediaIds: ['attached-photo'] }] })),
      updateReview: vi.fn(() => EMPTY),
    };
    const page = make(OrderDetailPage, api); page.fetchOrder('order');
    page.openReviewModal({ lineId: 'line' }); page.reviewContent = 'Edited text'; page.submitReview();
    const payload = api.updateReview.mock.calls[0][1];
    expect(payload).not.toHaveProperty('mediaIds');
    // ReviewsService.update replaces missing mediaIds with [] (reviews.service.ts:92,97).
    expect(payload.mediaIds ?? []).toEqual([]);
  });

  it('reproduces voucher ending at 07:00 Vietnam on a day labeled "Đến hết ngày"', () => {
    const api = { adminCreateVoucher: vi.fn(() => EMPTY) };
    const page = make(AdminVouchersPage, api);
    page.formCode = 'DAY'; page.formValidFrom = '2026-10-29'; page.formValidTo = '2026-10-30'; page.saveVoucher();
    const payload = api.adminCreateVoucher.mock.calls[0][0];
    expect(payload.validTo).toBe('2026-10-30T00:00:00.000Z');
    expect(Date.parse('2026-10-30T08:00:00+07:00')).toBeGreaterThan(Date.parse(payload.validTo));
  });

  it('reproduces voucher saving stuck true after the required date is cleared', () => {
    const api = { adminCreateVoucher: vi.fn(() => EMPTY) };
    const page = make(AdminVouchersPage, api);
    page.formCode = 'DAY'; page.formValidFrom = ''; page.formValidTo = '2026-10-30';
    expect(() => page.saveVoucher()).toThrow(RangeError);
    expect(page.saving()).toBe(true); expect(api.adminCreateVoucher).not.toHaveBeenCalled();
  });

  it('reproduces historical AI result purchase link pointing at the currently selected other product', () => {
    vi.stubGlobal('window', { scrollTo: vi.fn() });
    const page = make(AiTryOnPage, {});
    page.catalogProducts.set([{ id: 'new-shirt', slug: 'new-shirt', name: 'New shirt' }] as any);
    page.selectedProductId.set('new-shirt');
    page.selectHistoricalJob({ id: 'past-job', state: 'COMPLETED', detectedItems: [{ productId: 'old-dress', category: 'dress', targetRegion: 'body' }], resultUrls: ['dress-result'] } as any);
    expect(page.job()?.detectedItems?.[0].productId).toBe('old-dress');
    // The completed-state template uses getSelectedProduct(), not the result's product identity.
    expect(page.getSelectedProduct()?.id).toBe('new-shirt');
    page.ngOnDestroy();
  });
});
