import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { Category, ProductSummary } from '@fashion/contracts';
import { ApiService, type CatalogFilters } from '../services/api.service';
import { STORE_CATALOG_CONTENT } from '../shared/store-content';
import { PageStateComponent } from '../components/page-state.component';

type ChipKey = 'category' | 'q' | 'size' | 'color' | 'price';
type PriceRange = { label: string; min?: number; max?: number };

/** Trường tùy chọn: chỉ hiện khi API trả về. */
type CatalogProduct = ProductSummary & { compareAtPrice?: number; originalPrice?: number; listPrice?: number; badge?: string; label?: string; isNew?: boolean };

@Component({
  standalone: true,
  imports: [PageStateComponent, RouterLink, CurrencyPipe, FormsModule],
  template: `
    <main class="catalog-container">
      <header class="catalog-header">
        <div>
          <h1 class="page-title">{{ content.title }}</h1>
          <p class="page-desc">{{ content.description }}</p>
        </div>
        @if (!loading() && total() > 0) {
          <span class="total-count">{{ total() }} SẢN PHẨM</span>
        }
      </header>

      <!-- Hàng tab danh mục -->
      <nav class="category-row" aria-label="Danh mục sản phẩm">
        <button type="button" class="tab" [class.active]="selectedCategory() === ''" (click)="selectCategory('')">TẤT CẢ</button>
        @for (cat of featuredCategories(); track cat.id) {
          <button type="button" class="tab" [class.active]="selectedCategory() === cat.slug" (click)="selectCategory(cat.slug)">{{ cat.name }}</button>
        }
        @if (selectableCategories().length > featuredCategories().length) {
          <select aria-label="Danh mục khác" [ngModel]="selectedCategory()" (ngModelChange)="selectCategory($event)" class="category-select">
            <option value="">Danh mục khác</option>
            @for (cat of selectableCategories(); track cat.id) {
              <option [value]="cat.slug">{{ cat.name }}</option>
            }
          </select>
        }
      </nav>

      <!-- Thanh lọc -->
      <section class="filter-bar" aria-label="Bộ lọc và sắp xếp">
        <div class="filter-main">
          <div class="filter-left">
            <span class="filter-label">LỌC:</span>
            <select class="filter-dd" aria-label="Kích cỡ" [ngModel]="size()" (ngModelChange)="setFilter('size', $event)">
              <option value="">{{ content.filterLabels.size }}</option>
              @for (v of filterOptions().sizes; track v) { <option [value]="v">{{ v }}</option> }
            </select>
            <select class="filter-dd" aria-label="Màu sắc" [ngModel]="color()" (ngModelChange)="setFilter('color', $event)">
              <option value="">{{ content.filterLabels.color }}</option>
              @for (v of filterOptions().colors; track v) { <option [value]="v">{{ v }}</option> }
            </select>
            <div class="price-filter">
              <button type="button" class="filter-dd price-toggle" [class.on]="minPrice() !== '' || maxPrice() !== ''" [attr.aria-expanded]="priceOpen()" aria-controls="price-panel" (click)="priceOpen.set(!priceOpen())">{{ content.filterLabels.price }} <span aria-hidden="true">⌄</span></button>
              @if (priceOpen()) {
                <div class="price-panel" id="price-panel">
                  <div class="price-presets">
                    @for (r of content.priceRanges; track r.label) {
                      <button type="button" class="preset" [class.active]="isPreset(r)" (click)="applyPreset(r)">{{ r.label }}</button>
                    }
                  </div>
                  <div class="price-custom">
                    <label>{{ content.priceFrom }}<input type="number" min="0" inputmode="numeric" [placeholder]="priceBound('min')" [(ngModel)]="fromInput" name="priceFrom" /></label>
                    <label>{{ content.priceTo }}<input type="number" min="0" inputmode="numeric" [placeholder]="priceBound('max')" [(ngModel)]="toInput" name="priceTo" /></label>
                    <button type="button" class="preset apply" (click)="applyCustomPrice()">{{ content.priceApply }}</button>
                  </div>
                  @if (priceError()) { <p class="price-error" role="alert">{{ priceError() }}</p> }
                </div>
              }
            </div>
            <span class="divider" aria-hidden="true"></span>
            <button type="button" class="reset-btn" (click)="resetFilters()">✕ XÓA BỘ LỌC</button>
          </div>
          <div class="filter-right">
            <div class="search-box">
              <input type="text" aria-label="Tìm kiếm sản phẩm" placeholder="Tìm tên trang phục, phụ kiện..." [(ngModel)]="query" (keyup.enter)="submitQuery()" />
              <button type="button" (click)="submitQuery()" aria-label="Tìm kiếm">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
              </button>
            </div>
            <div class="sort-control">
              <label for="sort-select">SẮP XẾP THEO:</label>
              <select id="sort-select" [ngModel]="sortOption" (ngModelChange)="setFilter('sort', $event)">
                @for (o of content.sortOptions; track o.value) { <option [value]="o.value">{{ o.label }}</option> }
              </select>
            </div>
          </div>
        </div>
        @if (activeChips().length > 0) {
          <div class="chip-row">
            <span class="chip-label">Đang lọc:</span>
            @for (chip of activeChips(); track chip.key) {
              <span class="chip">{{ chip.text }}
                <button type="button" (click)="removeChip(chip.key)" [attr.aria-label]="'Bỏ lọc ' + chip.text">✕</button>
              </span>
            }
          </div>
        }
      </section>

      @if (error()) {
        <fc-page-state kind="error" title="Không thể tải sản phẩm" [message]="error()" actionLabel="THỬ LẠI" (action)="loadProducts()" />
      }

      @if (!error() && loading()) {
        <div class="product-grid skeleton-grid">
          @for (item of [1,2,3,4,5,6,7,8]; track item) {
            <div class="skeleton-card">
              <div class="skeleton-image"></div>
              <div class="skeleton-text"></div>
              <div class="skeleton-sub"></div>
            </div>
          }
        </div>
      } @else if (!error()) {
        <div class="product-grid">
          @for (p of products(); track p.id) {
            <article class="product-card">
              <div class="product-thumbnail">
                <a class="thumb-link" [routerLink]="['/products', p.slug]" [attr.aria-label]="p.name">
                  @if (p.images && p.images.length > 0) {
                    <img [src]="p.images[0]" [alt]="p.name" loading="lazy" />
                  } @else {
                    <div class="image-placeholder"><span>MUSE</span></div>
                  }
                </a>
                @if (badgeOf(p); as b) { <span class="badge" [class.sale]="b.sale">{{ b.text }}</span> }
              </div>
              <div class="product-info">
                @if (categoryName(p); as cn) { <span class="product-cat">{{ cn }}</span> }
                <h3 class="product-name"><a [routerLink]="['/products', p.slug]">{{ p.name }}</a></h3>
                <div class="price-row">
                  @if (oldPrice(p); as old) {
                    <span class="product-price sale-price">{{ p.price | currency:'VND':'symbol':'1.0-0' }}</span>
                    <span class="old-price">{{ old | currency:'VND':'symbol':'1.0-0' }}</span>
                  } @else {
                    <span class="product-price">{{ p.price | currency:'VND':'symbol':'1.0-0' }}</span>
                  }
                </div>
              </div>
              <a class="buy-btn" [routerLink]="['/products', p.slug]">MUA NGAY <span aria-hidden="true">🛒︎</span></a>
            </article>
          } @empty {
            <fc-page-state kind="empty" title="Không tìm thấy sản phẩm" message="Hãy thử thay đổi từ khóa tìm kiếm hoặc lọc theo danh mục khác." actionLabel="XEM TẤT CẢ SẢN PHẨM" (action)="resetFilters()" />
          }
        </div>

        @if (total() > limit) {
          <div class="pagination-area">
            <nav class="pager" aria-label="Phân trang sản phẩm">
              <button type="button" class="pg" [disabled]="page() <= 1" (click)="changePage(page() - 1)" aria-label="Trang trước">‹</button>
              @for (n of pageItems(); track $index) {
                @if (n === 0) { <span class="pg-gap">…</span> }
                @else { <button type="button" class="pg" [class.current]="n === page()" [attr.aria-current]="n === page() ? 'page' : null" (click)="changePage(n)">{{ n }}</button> }
              }
              <button type="button" class="pg" [disabled]="page() >= totalPages()" (click)="changePage(page() + 1)" aria-label="Trang sau">›</button>
            </nav>
            <p class="page-summary">Hiển thị {{ products().length }} trên tổng số {{ total() }} sản phẩm</p>
          </div>
        }
      }
    </main>

  `,
  styles: [`
    :host { display: block; }
    .catalog-container { max-width: 1184px; margin: 0 auto; padding: 56px 24px 72px; }
    .catalog-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; padding-bottom: 12px; border-bottom: 1px solid #c4c7c7; }
    .page-title { margin: 0; font: 400 40px/48px var(--font-serif); letter-spacing: -1px; color: #000; }
    .page-desc { margin: 4px 0 0; color: #444748; font-size: 14px; line-height: 22px; }
    .total-count { color: #444748; font-size: 12px; letter-spacing: .6px; white-space: nowrap; }
    .category-row { display: flex; flex-wrap: wrap; align-items: center; gap: 0 34px; margin-top: 32px; padding-bottom: 0; border-bottom: 1px solid #e9e8e7; }
    .tab { padding: 8px 0 10px; border: 0; border-bottom: 2px solid transparent; background: none; color: #444748; font-weight: 600; font-size: 13px; line-height: 16px; font-family: inherit; letter-spacing: .65px; text-transform: uppercase; cursor: pointer; }
    .tab:hover { color: #000; }
    .tab.active { color: #171717; font-weight: 700; border-bottom-color: #f4b8c1; }
    .category-select { margin-left: auto; min-height: 34px; padding: 0 10px; border: 1px solid #c4c7c7; background: #fbf9f9; font-size: 12px; }
    .filter-bar { margin-top: 32px; border: 1px solid #c4c7c7; background: #fff; }
    .filter-main { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px 24px; padding: 12px 16px; }
    .filter-left, .filter-right { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
    .filter-label { font-size: 11px; font-weight: 700; letter-spacing: .55px; }
    .filter-dd { height: 40px; padding: 0 14px; border: 1px solid #c4c7c7; background: #fbf9f9; color: #000; font-weight: 600; font-size: 13px; line-height: 16px; font-family: inherit; letter-spacing: .65px; cursor: pointer; }
    .filter-dd:hover, .filter-dd.on { border-color: #171717; }
    .price-filter { position: relative; }
    .price-panel { position: absolute; top: calc(100% + 6px); left: 0; z-index: 20; display: grid; gap: 14px; width: 320px; max-width: calc(100vw - 32px); padding: 16px; border: 1px solid #171717; background: #fff; box-shadow: 0 14px 32px rgba(0,0,0,.12); }
    .price-presets { display: flex; flex-wrap: wrap; gap: 8px; }
    .preset { min-height: 36px; padding: 0 12px; border: 1px solid #c4c7c7; border-radius: 0; background: #fff; color: #171717; font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }
    .preset:hover, .preset.active { border-color: #171717; background: #f4b8c1; }
    .price-custom { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; align-items: end; }
    .price-custom label { display: grid; gap: 4px; color: #444748; font-size: 11px; font-weight: 700; letter-spacing: .5px; }
    .price-custom input { height: 36px; min-width: 0; padding: 0 8px; border: 1px solid #c4c7c7; border-radius: 0; font: inherit; font-size: 13px; }
    .preset.apply { grid-column: 1 / -1; background: #171717; color: #fff; border-color: #171717; }
    .preset.apply:hover { background: #f4b8c1; color: #171717; }
    .price-error { margin: 0; color: #9b2c2c; font-size: 12px; }
    .divider { width: 1px; height: 20px; background: #c4c7c7; }
    .reset-btn { border: 0; background: none; color: #444748; font-weight: 600; font-size: 11px; line-height: 14px; font-family: inherit; letter-spacing: .55px; cursor: pointer; }
    .reset-btn:hover { color: #000; text-decoration: underline; }
    .search-box { display: flex; align-items: center; height: 40px; border: 1px solid #c4c7c7; background: #fbf9f9; }
    .search-box input { width: 220px; min-width: 0; height: 100%; padding: 0 12px; border: 0; background: transparent; font: inherit; font-size: 13px; outline: 0; }
    .search-box button { width: 40px; height: 100%; border: 0; background: none; color: #171717; cursor: pointer; }
    .search-box:focus-within { outline: 2px solid #171717; outline-offset: 1px; }
    .sort-control { display: flex; align-items: center; gap: 12px; }
    .sort-control label { color: #444748; font-size: 11px; font-weight: 600; letter-spacing: .55px; }
    .sort-control select { height: 40px; min-width: 190px; padding: 0 12px; border: 1px solid #c4c7c7; background: #fbf9f9; font-weight: 600; font-size: 13px; line-height: 16px; font-family: inherit; letter-spacing: .65px; text-transform: uppercase; }
    .chip-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 8px 16px; border-top: 1px solid #efeded; }
    .chip-label { color: #444748; font-size: 12px; }
    .chip { display: inline-flex; align-items: center; gap: 8px; height: 24px; padding: 0 8px; border: 1px solid #c4c7c7; background: #fbf9f9; font-size: 11px; font-weight: 600; letter-spacing: .55px; text-transform: uppercase; }
    .chip button { padding: 0; border: 0; background: none; font-size: 10px; cursor: pointer; }
    .product-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 40px 24px; margin-top: 32px; }
    .product-card { min-width: 0; }
    .product-thumbnail { position: relative; aspect-ratio: 3 / 4; overflow: hidden; background: #f5f3f3; }
    .thumb-link { display: block; width: 100%; height: 100%; }
    .product-thumbnail img { display: block; width: 100%; height: 100%; object-fit: cover; transition: transform .25s ease; }
    .product-card:hover .product-thumbnail img { transform: scale(1.03); }
    .image-placeholder { display: flex; width: 100%; height: 100%; align-items: center; justify-content: center; color: #8c8177; font-size: 12px; letter-spacing: .25em; }
    .badge { position: absolute; top: 0; left: 0; padding: 4px 10px; background: #000; color: #fff; font-size: 11px; font-weight: 600; letter-spacing: 1.1px; text-transform: uppercase; }
    .badge.sale { background: #f4b8c1; color: #171717; }
    .product-info { padding-top: 12px; }
    .product-cat { display: block; color: #444748; font-size: 11px; font-weight: 600; letter-spacing: .55px; text-transform: uppercase; }
    .product-name { margin: 4px 0 6px; font-size: 14px; font-weight: 500; line-height: 22px; letter-spacing: .35px; color: #000; }
    .product-name a { color: inherit; text-decoration: none; }
    .product-name a:hover { text-decoration: underline; }
    .price-row { display: flex; align-items: baseline; gap: 10px; min-height: 24px; }
    .product-price { font-size: 14px; font-weight: 600; color: #000; }
    .sale-price { color: #b84a62; }
    .old-price { color: #747878; font-size: 12px; font-weight: 300; text-decoration: line-through; }
    .buy-btn { display: flex; align-items: center; justify-content: center; gap: 8px; height: 40px; margin: 16px 10px 0; border: 1px solid #000; border-radius: 15px; background: #171717; color: #fff; font-size: 13px; font-weight: 700; letter-spacing: 1.3px; text-decoration: none; }
    .buy-btn:hover { background: #fff; color: #171717; }
    .buy-btn:focus-visible, .tab:focus-visible, .pg:focus-visible { outline: 2px solid #171717; outline-offset: 2px; }
    .pagination-area { display: flex; flex-direction: column; align-items: center; gap: 16px; margin-top: 56px; padding-top: 40px; border-top: 1px solid #c4c7c7; }
    .pager { display: flex; align-items: center; }
    .pg { width: 40px; height: 40px; margin: 0 4px; border: 1px solid #c4c7c7; background: #fff; color: #000; font-size: 13px; font-weight: 600; letter-spacing: 1.8px; cursor: pointer; }
    .pg.current { border-color: #171717; background: #171717; color: #fff; font-weight: 700; }
    .pg:disabled { opacity: .4; cursor: not-allowed; }
    .pg-gap { padding: 0 12px; color: #747878; }
    .page-summary { margin: 0; color: #444748; font-size: 12px; }.btn-primary{ min-height: 44px; padding: 0 22px; border: 1px solid #171717; background: #171717; color: #fff; font-weight: 600; letter-spacing: .65px; cursor: pointer; }
    .skeleton-grid { margin-top: 32px; }
    .skeleton-image { aspect-ratio: 3 / 4; background: #efeded; animation: pulse 1.4s ease-in-out infinite; }
    .skeleton-text, .skeleton-sub { height: 14px; margin-top: 12px; background: #efeded; animation: pulse 1.4s ease-in-out infinite; }
    .skeleton-sub { width: 40%; }
    @keyframes pulse { 50% { opacity: .5; } }
    @media (max-width: 1000px) { .product-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 600px) {
      .catalog-container { padding: 36px 16px 48px; }
      .page-title { font-size: 30px; line-height: 38px; }
      .product-grid { grid-template-columns: 1fr; gap: 36px; }
      .search-box, .search-box input, .sort-control, .sort-control select { width: 100%; }
      .filter-right { width: 100%; }
      .category-row { gap: 0 22px; overflow-x: auto; flex-wrap: nowrap; white-space: nowrap; }
    }
  `],
})
export class CatalogPage implements OnInit, OnDestroy {
  private productsRequest?: Subscription;
  private categoriesRequest?: Subscription;
  private filtersRequest?: Subscription;
  ngOnDestroy(): void { this.queryParamsSub?.unsubscribe(); this.productsRequest?.unsubscribe(); this.categoriesRequest?.unsubscribe(); this.filtersRequest?.unsubscribe(); }
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly content = STORE_CATALOG_CONTENT;
  private queryParamsSub?: Subscription;

  readonly products = signal<ProductSummary[]>([]);
  readonly categories = signal<Category[]>([]);
  readonly selectableCategories = computed(() => this.categories().filter(c => !!c.slug));
  readonly featuredCategories = computed(() => {
    const seen = new Set<string>();
    return this.selectableCategories().filter(cat => {
      const name = cat.name.trim().toLocaleLowerCase();
      if (seen.has(name)) return false;
      seen.add(name);
      return true;
    }).slice(0, 6);
  });
  readonly loading = signal<boolean>(false);
  readonly error = signal<string>('');

  query = '';
  selectedCategory = signal<string>('');
  sortOption = '';
  readonly size = signal('');
  readonly color = signal('');
  readonly minPrice = signal('');
  readonly maxPrice = signal('');
  readonly filterOptions = signal<CatalogFilters>({ sizes: [], colors: [], minPrice: null, maxPrice: null });
  readonly priceOpen = signal(false);
  readonly priceError = signal('');
  fromInput: number | null = null;
  toInput: number | null = null;
  page = signal<number>(1);
  limit = 12;
  total = signal<number>(0);

  totalPages = signal<number>(1);

  ngOnInit(): void {
    this.loadCategories();
    // Đọc q từ URL (cả khi q đổi lúc đang ở trang) rồi tải theo q.
    this.loadFilterOptions();
    // Toàn bộ bộ lọc nằm trên URL: đọc lại mỗi khi URL đổi rồi tải danh sách.
    this.queryParamsSub = this.route.queryParamMap.subscribe(params => {
      this.query = params.get('q') ?? '';
      this.selectedCategory.set(params.get('category') ?? '');
      this.sortOption = params.get('sort') ?? '';
      this.size.set(params.get('size') ?? '');
      this.color.set(params.get('color') ?? '');
      this.minPrice.set(this.validPrice(params.get('minPrice')));
      this.maxPrice.set(this.validPrice(params.get('maxPrice')));
      this.fromInput = this.minPrice() === '' ? null : Number(this.minPrice());
      this.toInput = this.maxPrice() === '' ? null : Number(this.maxPrice());
      this.page.set(1);
      this.loadProducts();
    });
  }

  private validPrice(value: string | null): string {
    if (value === null || value.trim() === '') return '';
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? String(Math.floor(n)) : '';
  }

  loadFilterOptions(): void {
    this.filtersRequest = this.api.catalogFilters().subscribe({
      next: options => this.filterOptions.set(options),
      error: () => this.filterOptions.set({ sizes: [], colors: [], minPrice: null, maxPrice: null }),
    });
  }

  loadCategories(): void {
    this.categoriesRequest = this.api.categories().subscribe({
      next: cats => this.categories.set(cats),
      error: () => this.error.set('Không thể tải danh mục. Vui lòng thử lại.'),
    });
  }

  loadProducts(): void {
    this.productsRequest?.unsubscribe();
    this.loading.set(true);
    this.error.set('');

    this.appliedQuery.set(this.query.trim());
    this.productsRequest = this.api.products({
      q: this.query,
      category: this.selectedCategory(),
      sort: this.sortOption,
      page: this.page(),
      limit: this.limit,
      size: this.size() || undefined,
      color: this.color() || undefined,
      minPrice: this.minPrice() === '' ? undefined : Number(this.minPrice()),
      maxPrice: this.maxPrice() === '' ? undefined : Number(this.maxPrice()),
    }).subscribe({
      next: (res) => {
        this.products.set(res.items);
        this.total.set(res.total);
        this.totalPages.set(Math.ceil(res.total / this.limit) || 1);
        this.loading.set(false);
      },
      error: () => {
        this.products.set([]);
        this.total.set(0);
        this.error.set('Không thể tải sản phẩm. Kiểm tra kết nối và thử lại.');
        this.loading.set(false);
      },
    });
  }

  readonly categoryMap = computed(() => new Map(this.categories().map(c => [c.id, c.name])));
  readonly activeChips = computed(() => {
    const chips: { key: ChipKey; text: string }[] = [];
    const sel = this.selectedCategory();
    if (sel) {
      const cat = this.categories().find(c => c.slug === sel);
      chips.push({ key: 'category', text: `DANH MỤC: ${cat?.name ?? sel}` });
    }
    if (this.appliedQuery()) chips.push({ key: 'q', text: `TÌM: ${this.appliedQuery()}` });
    if (this.size()) chips.push({ key: 'size', text: `KÍCH CỠ: ${this.size()}` });
    if (this.color()) chips.push({ key: 'color', text: `MÀU: ${this.color()}` });
    const min = this.minPrice(), max = this.maxPrice();
    if (min !== '' || max !== '') {
      const fmt = (v: string) => Number(v).toLocaleString('vi-VN') + 'đ';
      const text = min !== '' && max !== '' ? `${fmt(min)} – ${fmt(max)}` : min !== '' ? `Từ ${fmt(min)}` : `Đến ${fmt(max)}`;
      chips.push({ key: 'price', text: `GIÁ: ${text}` });
    }
    return chips;
  });
  readonly appliedQuery = signal('');
  readonly pageItems = computed<number[]>(() => {
    const last = this.totalPages(), cur = this.page();
    if (last <= 7) return Array.from({ length: last }, (_, i) => i + 1);
    const set = new Set([1, last, cur - 1, cur, cur + 1].filter(n => n >= 1 && n <= last));
    const sorted = [...set].sort((a, b) => a - b);
    const out: number[] = [];
    sorted.forEach((n, i) => { if (i > 0 && n - sorted[i - 1] > 1) out.push(0); out.push(n); });
    return out;
  });

  categoryName(p: ProductSummary): string {
    return p.categoryId ? this.categoryMap().get(p.categoryId) ?? '' : '';
  }
  oldPrice(p: ProductSummary): number | null {
    const x = p as CatalogProduct;
    const old = x.compareAtPrice ?? x.originalPrice ?? x.listPrice;
    return typeof old === 'number' && old > p.price ? old : null;
  }
  badgeOf(p: ProductSummary): { text: string; sale: boolean } | null {
    const old = this.oldPrice(p);
    if (old) return { text: `SALE -${Math.round((1 - p.price / old) * 100)}%`, sale: true };
    const x = p as CatalogProduct;
    const text = x.badge || x.label || (x.isNew ? 'MỚI' : '');
    return text ? { text, sale: false } : null;
  }

  /**
   * Cập nhật các tham số lọc trên URL; subscription đọc URL sẽ tải lại từ trang 1.
   * Nếu URL không đổi (đã đúng giá trị) thì tải lại trực tiếp.
   */
  private applyParams(patch: Record<string, string | null | undefined>): void {
    const queryParams: Record<string, string | null> = {};
    let changed = false;
    for (const [key, raw] of Object.entries(patch)) {
      const value = raw ? raw : null;
      queryParams[key] = value;
      if ((this.route.snapshot.queryParamMap.get(key) ?? null) !== value) changed = true;
    }
    if (!changed) { this.page.set(1); this.loadProducts(); return; }
    this.router.navigate([], { relativeTo: this.route, queryParams, queryParamsHandling: 'merge' });
  }

  /** Gửi từ khóa: đưa q lên URL để header và trang đồng bộ. */
  submitQuery(): void {
    const q = this.query.trim();
    this.query = q;
    this.applyParams({ q });
  }

  setFilter(key: 'size' | 'color' | 'sort', value: string): void {
    this.applyParams({ [key]: value });
  }

  applyPreset(range: PriceRange): void {
    this.priceError.set('');
    this.priceOpen.set(false);
    this.applyParams({ minPrice: range.min === undefined ? null : String(range.min), maxPrice: range.max === undefined ? null : String(range.max) });
  }

  isPreset(range: PriceRange): boolean {
    return this.minPrice() === (range.min === undefined ? '' : String(range.min)) && this.maxPrice() === (range.max === undefined ? '' : String(range.max));
  }

  applyCustomPrice(): void {
    const from = this.fromInput === null || this.fromInput === undefined || String(this.fromInput) === '' ? null : Number(this.fromInput);
    const to = this.toInput === null || this.toInput === undefined || String(this.toInput) === '' ? null : Number(this.toInput);
    if ((from !== null && (!Number.isFinite(from) || from < 0)) || (to !== null && (!Number.isFinite(to) || to < 0)) || (from !== null && to !== null && from > to)) {
      this.priceError.set(this.content.priceInvalid);
      return;
    }
    this.priceError.set('');
    this.priceOpen.set(false);
    this.applyParams({ minPrice: from === null ? null : String(Math.floor(from)), maxPrice: to === null ? null : String(Math.floor(to)) });
  }

  priceBound(which: 'min' | 'max'): string {
    const v = which === 'min' ? this.filterOptions().minPrice : this.filterOptions().maxPrice;
    return v === null ? '' : String(v);
  }

  removeChip(key: ChipKey): void {
    switch (key) {
      case 'category': this.selectCategory(''); break;
      case 'q': this.query = ''; this.submitQuery(); break;
      case 'size': case 'color': this.setFilter(key, ''); break;
      case 'price': this.priceError.set(''); this.applyParams({ minPrice: null, maxPrice: null }); break;
    }
  }

  search(): void {
    this.page.set(1);
    this.loadProducts();
  }

  selectCategory(slug: string): void {
    this.applyParams({ category: slug });
  }

  changePage(newPage: number): void {
    if (newPage < 1 || newPage > this.totalPages()) return;
    this.page.set(newPage);
    this.loadProducts();
    window.scrollTo({ top: 300, behavior: 'smooth' });
  }

  resetFilters(): void {
    this.priceError.set('');
    this.priceOpen.set(false);
    this.applyParams({ q: null, category: null, sort: null, size: null, color: null, minPrice: null, maxPrice: null });
  }
}
