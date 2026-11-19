import { readFileSync } from 'node:fs';
import { Injector, runInInjectionContext } from '@angular/core';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import type { ProductSummary } from '@fashion/contracts';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';
import { AdminProductsPage } from './admin-products.page';

const M1 = '64b0000000000000000000m1';

function makePage(api: Record<string, unknown>) {
  const injector = Injector.create({ providers: [
    { provide: ApiService, useValue: api },
    { provide: AuthService, useValue: {} },
    { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } },
    { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap({})) } },
    { provide: Router, useValue: { navigate: vi.fn() } },
  ] });
  return runInInjectionContext(injector, () => new AdminProductsPage());
}

function openEdit(aiReferenceImage: string | null) {
  const detail = { id: 'p1', variants: [], images: ['https://cdn.example.com/model.jpg', 'https://signed.example.com/m1'], aiReferenceImage };
  const api = { adminGetProduct: vi.fn(() => of(detail)), adminUpdateProduct: vi.fn(() => of({})), adminListProducts: vi.fn(() => of({ items: [], total: 0 })) };
  const page = makePage(api);
  const row = { id: 'p1', name: 'Quần jean', slug: 'quan-jean', price: 1, currency: 'VND', status: 'PUBLISHED', categoryId: 'c1',
    images: ['https://cdn.example.com/model.jpg'], imageMediaIds: [M1] } as unknown as ProductSummary;
  page.openEditProduct(row);
  return { page, api };
}

describe('Admin chọn "Dùng cho AI thử đồ"', () => {
  it('shows the saved choice (an uploaded image is stored by its media id)', () => {
    const { page } = openEdit(M1);
    expect(page.isAiReference('https://signed.example.com/m1')).toBe(true);
    expect(page.isAiReference('https://cdn.example.com/model.jpg')).toBe(false);
    expect(page.aiReferencePayload()).toBe(M1);
  });

  it('selecting a manual image saves its URL; selecting it again clears it', () => {
    const { page } = openEdit(null);
    expect(page.aiReferencePayload()).toBeNull();
    page.toggleAiReference('https://cdn.example.com/model.jpg');
    expect(page.aiReferencePayload()).toBe('https://cdn.example.com/model.jpg');
    page.toggleAiReference('https://cdn.example.com/model.jpg');
    expect(page.aiReferencePayload()).toBeNull();
  });

  it('removing the chosen image clears the choice', () => {
    const { page } = openEdit(M1);
    page.removeImage(1);
    expect(page.aiReferencePayload()).toBeNull();
  });

  it('sends aiReferenceImage when saving the product', () => {
    const { page, api } = openEdit(null);
    page.toggleAiReference('https://signed.example.com/m1');
    page.saveProduct();
    expect(api.adminUpdateProduct).toHaveBeenCalledWith('p1', expect.objectContaining({ aiReferenceImage: M1 }));
  });

  it('shows the hint and the "Chưa chọn ảnh AI" label in the edit drawer', () => {
    const source = readFileSync(new URL('./admin-products.page.ts', import.meta.url), 'utf8');
    expect(source).toContain('Chọn ảnh CHỈ có riêng sản phẩm (chụp trải phẳng hoặc trên móc, nền trơn). Không chọn ảnh người mẫu mặc kèm món khác, AI sẽ dễ lấy nhầm.');
    expect(source).toContain('Chưa chọn ảnh AI');
    expect(source).toContain("'Dùng cho AI thử đồ'");
  });
});
