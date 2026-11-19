import { readFileSync } from 'node:fs';
import { Injector, runInInjectionContext } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ApiService } from '../services/api.service';
import { CartService } from '../services/cart.service';
import { ToastService } from '../services/toast.service';
import { AiMixMatchPage } from './ai-mix-match.page';

const product = (id: string, name: string, categoryId: string | null = null) =>
  ({ id, name, slug: id, price: 1, currency: 'VND', images: [], status: 'PUBLISHED', categoryId });

function openPage() {
  const toast = { error: vi.fn(), success: vi.fn(), warning: vi.fn() };
  const createMixMatch = vi.fn();
  const api = {
    categories: vi.fn(() => of([{ id: 'c-quan', name: 'Quần', slug: 'quan' }])),
    products: vi.fn(() => of({ items: [
      product('ao', 'Áo sơ mi lụa'), product('jean', 'Quần jean ống suông'), product('chanvay', 'Chân váy xếp ly'),
      product('dam', 'Đầm hoa nhí'), product('moi', 'Mẫu mới mùa hè', 'c-quan'), product('giay', 'Giày cao gót'),
    ], total: 6, page: 1, limit: 12 })),
    createMixMatch,
  };
  const injector = Injector.create({ providers: [
    { provide: ApiService, useValue: api }, { provide: ToastService, useValue: toast },
    { provide: CartService, useValue: {} }, { provide: ActivatedRoute, useValue: {} },
  ] });
  const page = runInInjectionContext(injector, () => new AiMixMatchPage());
  page.ngOnInit();
  return { page, toast, createMixMatch };
}

describe('Trang Phối đồ: quy tắc bộ phối ngay khi chọn', () => {
  it('labels each selected item with its position', () => {
    const { page } = openPage();
    const labels = Object.fromEntries(page.products().map((p) => [p.id, page.slotOf(p).label]));
    expect(labels).toMatchObject({ ao: 'Áo sơ mi', jean: 'Quần jean', chanvay: 'Chân váy', dam: 'Đầm', giay: 'Giày cao gót' });
    expect(page.slotOf(page.products().find((p) => p.id === 'moi')!).slot).toBe('BOTTOM');
  });

  it('allows a top + bottom + shoes outfit', () => {
    const { page } = openPage();
    page.selectedProductIds.set(['ao', 'jean', 'giay']);
    expect(page.outfitWarning()).toBeNull();
  });

  it('warns about two bottoms and blocks generating without calling the API', () => {
    const { page, toast, createMixMatch } = openPage();
    page.selectedProductIds.set(['jean', 'chanvay']);
    expect(page.outfitWarning()).toBe('Bạn đang chọn 2 món cùng vị trí (quần/chân váy). Mỗi vị trí chỉ chọn 1 món.');
    page.uploadedMediaId.set('m1');
    page.consentAccepted = true;
    page.generateMixMatch();
    expect(createMixMatch).not.toHaveBeenCalled();
    expect(toast.warning).toHaveBeenCalled();
  });

  it('warns about a dress together with a top', () => {
    const { page } = openPage();
    page.selectedProductIds.set(['dam', 'ao']);
    expect(page.outfitWarning()).toBe('Đầm/jumpsuit đã là cả bộ, không phối cùng áo hoặc quần. Vui lòng bỏ bớt một món.');
  });

  it('uses the category name like the server does', () => {
    const { page } = openPage();
    page.selectedProductIds.set(['jean', 'moi']);
    expect(page.outfitWarning()).toContain('(quần/chân váy)');
  });

  it('shows the tip, the warning and locks the generate button', () => {
    const source = readFileSync(new URL('./ai-mix-match.page.ts', import.meta.url), 'utf8');
    expect(source).toContain('Mẹo: chọn mỗi vị trí 1 món (ví dụ 1 áo + 1 quần/chân váy + 1 đôi giày) để AI phối chính xác nhất.');
    expect(source).toContain('@if (outfitWarning(); as warning) { <p class="outfit-warning" role="alert">{{ warning }}</p> }');
    expect(source).toContain('|| !!outfitWarning() ||');
  });
});
