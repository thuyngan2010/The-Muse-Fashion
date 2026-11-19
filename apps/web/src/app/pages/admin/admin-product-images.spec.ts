import { Injector, runInInjectionContext } from '@angular/core';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProductSummary } from '@fashion/contracts';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';
import { AdminProductsPage } from './admin-products.page';

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

afterEach(() => vi.unstubAllGlobals());

describe('Admin product images', () => {
  it('keeps an uploaded image (private media, url = null) and sends it as imageMediaIds', () => {
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:preview-1' });
    const api = { uploadImage: vi.fn(() => of({ id: '64b0000000000000000000m1', url: null, status: 'ACTIVE' })) };
    const page = makePage(api);
    page.openCreateProduct();
    const file = new Blob(['x'], { type: 'image/png' });
    page.uploadImage({ target: { files: [file], value: 'a.png' } } as unknown as Event);
    expect(page.prodImages()).toEqual(['blob:preview-1']);
    expect(page.imagePayload()).toEqual({ images: [], imageMediaIds: ['64b0000000000000000000m1'] });
    page.removeImage(0);
    expect(page.imagePayload()).toEqual({ images: [], imageMediaIds: [] });
  });

  it('shows saved media images when editing and keeps them on save', () => {
    const detail = { variants: [], images: ['https://cdn.example.com/a.jpg', 'https://signed.example.com/m1'] };
    const page = makePage({ adminGetProduct: vi.fn(() => of(detail)) });
    const row = { id: 'p1', name: 'Áo', slug: 'ao', price: 1, currency: 'VND', status: 'DRAFT', categoryId: 'c1',
      images: ['https://cdn.example.com/a.jpg'], imageMediaIds: ['64b0000000000000000000m1'] } as unknown as ProductSummary;
    page.openEditProduct(row);
    expect(page.prodImages()).toEqual(['https://cdn.example.com/a.jpg', 'https://signed.example.com/m1']);
    expect(page.imagePayload()).toEqual({ images: ['https://cdn.example.com/a.jpg'], imageMediaIds: ['64b0000000000000000000m1'] });
  });
});
