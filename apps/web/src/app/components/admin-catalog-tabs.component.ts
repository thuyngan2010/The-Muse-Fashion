import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../services/api.service';
import { AuthService } from '../services/auth.service';

export type CatalogTab = 'products' | 'categories' | 'inventory' | 'lookbooks';

type TabDef = { key: CatalogTab; label: string; link: string; query?: Record<string, string>; permission: 'catalog.manage' | 'inventory.manage' };

const TAB_DEFS: TabDef[] = [
  { key: 'products', label: 'Sản phẩm', link: '/admin/products', permission: 'catalog.manage' },
  { key: 'categories', label: 'Danh mục', link: '/admin/products', query: { tab: 'categories' }, permission: 'catalog.manage' },
  { key: 'inventory', label: 'Biến thể & Tồn kho', link: '/admin/inventory', permission: 'inventory.manage' },
  { key: 'lookbooks', label: 'Lookbook & Phối đồ', link: '/admin/lookbooks', permission: 'catalog.manage' },
];

/**
 * Tiêu đề + hàng tab dùng chung cho 3 trang Sản phẩm, Tồn kho, Lookbook.
 * Chỉ hiện tab mà tài khoản có quyền; số đếm cạnh tab lấy từ `total` hoặc độ dài danh sách của API.
 * Nút hành động của từng trang được chèn vào ô nội dung (ng-content).
 */
@Component({
  selector: 'fc-admin-catalog-tabs',
  standalone: true,
  imports: [RouterLink],
  template: `
    <header class="cat-head">
      <div>
        <h1 class="cat-title">Sản phẩm và Kho hàng</h1>
        <p class="cat-sub">Quản lý danh mục sản phẩm, biến thể, tồn kho và Lookbook.</p>
      </div>
      <div class="cat-actions"><ng-content /></div>
    </header>
    <nav class="cat-tabs" aria-label="Phân hệ sản phẩm và kho hàng">
      @for (tab of visibleTabs(); track tab.key) {
        <a class="cat-tab" [class.active]="tab.key === active()" [routerLink]="tab.link" [queryParams]="tab.query ?? null"
          [attr.aria-current]="tab.key === active() ? 'page' : null">
          {{ tab.label }}
          @if (counts()[tab.key] !== null && counts()[tab.key] !== undefined) { <span class="cat-count">{{ counts()[tab.key] }}</span> }
        </a>
      }
    </nav>
  `,
  styles: [`
    :host { display: block; }
    .cat-head { display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 16px; margin-bottom: 24px; }
    .cat-title { margin: 0; font: 500 32px/40px var(--font-serif); color: var(--ui-ink); }
    .cat-sub { margin: 4px 0 0; font-size: 13px; color: var(--ui-ink-soft); }
    .cat-actions { display: flex; flex-wrap: wrap; gap: 12px; }
    .cat-tabs { display: flex; gap: 4px; flex-wrap: wrap; border-bottom: 1px solid var(--admin-line); margin-bottom: 24px; }
    .cat-tab {
      display: inline-flex; align-items: center; gap: 8px; padding: 12px 16px; margin-bottom: -1px;
      font: 600 13px/20px var(--font-sans); color: var(--ui-ink-soft); text-decoration: none;
      border-bottom: 2px solid transparent;
    }
    .cat-tab:hover { color: var(--ui-ink); background: var(--ui-bg-soft); }
    .cat-tab.active { color: var(--ui-accent); border-bottom-color: var(--ui-accent); }
    .cat-count { min-width: 22px; padding: 1px 7px; border-radius: 999px; background: var(--ui-bg-soft); font: 600 11px/18px var(--font-sans); text-align: center; color: var(--ui-ink-soft); }
    .cat-tab.active .cat-count { background: var(--ui-pink-soft); color: var(--ui-accent); }
  `],
})
export class AdminCatalogTabsComponent implements OnInit {
  readonly active = input.required<CatalogTab>();
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

  readonly counts = signal<Partial<Record<CatalogTab, number | null>>>({});
  readonly visibleTabs = computed(() => TAB_DEFS.filter(tab => this.auth.can(tab.permission)));

  ngOnInit(): void {
    const set = (key: CatalogTab, value: number) => this.counts.update(c => ({ ...c, [key]: value }));
    // Lỗi từng số đếm chỉ làm mất con số, không ảnh hưởng tab.
    if (this.auth.can('catalog.manage')) {
      this.api.adminListProducts(undefined, 1, 1).subscribe({ next: res => set('products', res.total), error: () => undefined });
      this.api.adminCategories().subscribe({ next: items => set('categories', items.length), error: () => undefined });
      this.api.adminListLookbooks().subscribe({ next: res => set('lookbooks', res.items.length), error: () => undefined });
    }
    if (this.auth.can('inventory.manage')) {
      this.api.adminListInventory().subscribe({ next: res => set('inventory', res.items.length), error: () => undefined });
    }
  }
}
