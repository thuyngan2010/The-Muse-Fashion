import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { RouterLink } from '@angular/router';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { Category, ProductSummary } from '@fashion/contracts';
import { ApiService } from '../services/api.service';

@Component({
  standalone: true,
  imports: [RouterLink, CurrencyPipe, FormsModule],
  template: `
    <!-- Hero Banner -->
    <section class="hero-section">
      <div class="hero-content">
        <span class="eyebrow">BỘ SƯU TẬP 2026</span>
        <h1 class="hero-title">Phong cách tinh tế,<br><em>định hình cá tính.</em></h1>
        <p class="hero-subtitle">
          Khám phá những thiết kế thời trang đương đại được tuyển chọn dành cho phong cách riêng của bạn.
        </p>
        <div class="hero-actions">
          <a routerLink="/lookbooks" class="btn-outline">Khám phá Lookbook</a>
          <a routerLink="/ai/try-on" class="btn-primary">Thử đồ trực tuyến</a>
        </div>
      </div>
    </section>

    <!-- Catalog Main Area -->
    <main class="catalog-container">
      <!-- Search & Filter Bar -->
      <header class="catalog-header">
        <div>
          <span class="section-tag">MUSE COLLECTION</span>
          <h2 class="section-title">Tất cả sản phẩm</h2>
        </div>
        @if (!loading() && total() > 0) {
          <span class="total-count">{{ total() }} sản phẩm</span>
        }
      </header>

      <!-- Category Tabs -->
      <div class="category-row">
        <div class="category-pills">
          <button
            class="pill-btn"
            [class.active]="selectedCategory() === ''"
            (click)="selectCategory('')"
          >
            Tất cả
          </button>
          @for (cat of featuredCategories(); track cat.id) {
            <button
              class="pill-btn"
              [class.active]="selectedCategory() === cat.slug || selectedCategory() === cat.id"
              (click)="selectCategory(cat.slug || cat.id)"
            >
              {{ cat.name }}
            </button>
          }
          @if (categories().length > featuredCategories().length) {
            <select aria-label="Danh mục khác" [ngModel]="selectedCategory()" (ngModelChange)="selectCategory($event)" class="category-select">
              <option value="">Danh mục khác</option>
              @for (cat of categories(); track cat.id) {
                <option [value]="cat.slug || cat.id">{{ cat.name }} · {{ cat.slug || cat.id }}</option>
              }
            </select>
          }
        </div>
      </div>

      <!-- Search & Sort Toolbar -->
      <div class="filter-controls">
        <div class="search-box">
          <input
            type="text"
            aria-label="Tìm kiếm sản phẩm"
            placeholder="Tìm tên trang phục, phụ kiện..."
            [(ngModel)]="query"
            (keyup.enter)="search()"
          />
          <button (click)="search()" aria-label="Tìm kiếm">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
          </button>
        </div>
        <div class="sort-control">
          <label for="sort-select">Sắp xếp:</label>
          <select id="sort-select" [(ngModel)]="sortOption" (change)="search()">
            <option value="">Mặc định</option>
            <option value="newest">Mới nhất</option>
            <option value="price_asc">Giá: Thấp đến cao</option>
            <option value="price_desc">Giá: Cao đến thấp</option>
          </select>
        </div>
      </div>

      <!-- State: Error -->
      @if (error()) {
        <div class="state-notice error-notice">
          <p>{{ error() }}</p>
          <button class="retry-btn" (click)="loadProducts()">Thử lại</button>
        </div>
      }

      <!-- State: Loading -->
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
        <!-- Product Grid -->
        <div class="product-grid">
          @for (p of products(); track p.id) {
            <a class="product-card" [routerLink]="['/products', p.slug]">
              <div class="product-thumbnail">
                @if (p.images && p.images.length > 0) {
                  <img [src]="p.images[0]" [alt]="p.name" loading="lazy" />
                } @else {
                  <div class="image-placeholder">
                    <span>MUSE</span>
                  </div>
                }
              </div>
              <div class="product-info">
                <h3 class="product-name">{{ p.name }}</h3>
                <div class="price-row">
                  <span class="product-price">{{ p.price | currency:'VND':'symbol':'1.0-0' }}</span>
                </div>
              </div>
              <span class="hover-prompt">XEM CHI TIẾT <span aria-hidden="true">→</span></span>
            </a>
          } @empty {
            <div class="state-notice empty-notice">
              <h3>Không tìm thấy sản phẩm</h3>
              <p>Hãy thử thay đổi từ khóa tìm kiếm hoặc lọc theo danh mục khác.</p>
              <button class="btn-primary" (click)="resetFilters()">Xem tất cả sản phẩm</button>
            </div>
          }
        </div>

        <!-- Pagination -->
        @if (total() > limit) {
          <div class="pagination-bar">
            <button
              class="page-btn"
              [disabled]="page() <= 1"
              (click)="changePage(page() - 1)"
            >
              ← Trước
            </button>
            <span class="page-info">Trang {{ page() }} / {{ totalPages() }}</span>
            <button
              class="page-btn"
              [disabled]="page() >= totalPages()"
              (click)="changePage(page() + 1)"
            >
              Sau →
            </button>
          </div>
        }
      }
    </main>
  `,
  styles: [`
    .hero-section {
      background: #eae5de;
      padding: 90px 6vw;
      background-image: radial-gradient(#dfd8cf 1px, transparent 1px);
      background-size: 20px 20px;
    }
    .hero-content {
      max-width: 720px;
    }
    .eyebrow {
      font-size: 0.76rem;
      letter-spacing: 0.28em;
      color: var(--color-accent);
      font-weight: 700;
      display: inline-block;
      margin-bottom: 8px;
    }
    .hero-title {
      font-family: Georgia, serif;
      font-size: clamp(2.5rem, 5vw, 4.2rem);
      line-height: 1.16;
      font-weight: 500;
      margin: 12px 0 20px;
      color: var(--color-text);
    }
    .hero-title em {
      font-weight: 400;
      color: var(--color-accent);
    }
    .hero-subtitle {
      color: #555049;
      line-height: 1.8;
      font-size: 1.05rem;
      margin-bottom: 30px;
      max-width: 580px;
    }
    .hero-actions {
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
    }




    .catalog-container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 60px 6vw;
    }
    .catalog-header {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 20px;
      margin-bottom: 30px;
      flex-wrap: wrap;
    }
    .section-tag {
      font-size: 0.72rem;
      letter-spacing: 0.22em;
      color: var(--color-accent);
      font-weight: 700;
    }
    .section-title {
      font-family: Georgia, serif;
      font-size: 2.2rem;
      font-weight: 500;
      margin: 6px 0 0;
      color: var(--color-text);
    }
    .search-box {
      display: flex;
      align-items: center;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-control);
      background: var(--color-surface);
      overflow: hidden;
      min-width: 280px;
    }
    .search-box input {
      border: 0;
      padding: 12px 14px;
      font-size: 0.9rem;
      flex: 1;
      outline: none;
      background: transparent;
    }
    .search-box button {
      background: none;
      border: 0;
      padding: 0 14px;
      color: #555;
      cursor: pointer;
    }
    .filter-controls {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 20px;
      margin-bottom: 40px;
      padding-bottom: 20px;
      border-bottom: 1px solid var(--color-divider);
      flex-wrap: wrap;
    }
    .category-pills {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    .category-select { border: 1px solid #d8d2ca; background: #fff; border-radius: var(--radius-control); padding: 8px; max-width: 230px; }
    .pill-btn {
      background: var(--color-divider);
      border: 0;
      color: #4a453f;
      padding: 8px 18px;
      border-radius: 20px;
      font-size: 0.85rem;
      cursor: pointer;
      transition: all 0.15s;
    }
    .pill-btn:hover {
      background: #e2dfda;
      color: var(--color-text);
    }
    .pill-btn.active {
      background: var(--color-primary);
      color: var(--color-surface);
    }
    .sort-control {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 0.88rem;
      color: #555;
    }
    .sort-control select {
      border: 1px solid var(--color-border);
      border-radius: var(--radius-control);
      padding: 8px 12px;
      background: var(--color-surface);
      font-size: 0.88rem;
      outline: none;
      cursor: pointer;
    }
    .product-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 36px 28px;
    }
    .product-card {
      display: flex;
      flex-direction: column;
      text-decoration: none;
      color: inherit;
      transition: transform 0.2s ease;
    }
    .product-card:hover {
      transform: translateY(-4px);
    }
    .product-thumbnail {
      aspect-ratio: 3/4;
      background: #eae5de;
      border-radius: var(--radius-control);
      overflow: hidden;
      position: relative;
    }
    .product-thumbnail img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      transition: transform 0.3s ease;
    }
    .product-card:hover .product-thumbnail img {
      transform: scale(1.04);
    }
    .image-placeholder {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #aba196;
      letter-spacing: 0.3em;
      font-weight: 500;
      font-size: 0.85rem;
    }
    .hover-prompt {
      position: absolute;
      bottom: 12px;
      left: 12px;
      right: 12px;
      background: rgba(255, 255, 255, 0.92);
      backdrop-filter: blur(2px);
      padding: 8px;
      text-align: center;
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--color-text);
      border-radius: 3px;
      opacity: 0;
      transform: translateY(6px);
      transition: all 0.2s ease;
    }
    .product-card:hover .hover-prompt {
      opacity: 1;
      transform: translateY(0);
    }
    .product-info {
      padding-top: 14px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .product-name {
      font-size: 0.98rem;
      font-weight: 500;
      margin: 0;
      color: var(--color-text);
      line-height: 1.4;
    }
    .product-price {
      font-size: 0.95rem;
      font-weight: 600;
      color: var(--color-accent);
    }
    .state-notice {
      grid-column: 1 / -1;
      padding: 50px 30px;
      text-align: center;
      background: #f7f6f2;
      border-radius: var(--radius-card);
      border: 1px dashed #dedad2;
    }
    .error-notice {
      border-color: #ef9a9a;
      background: #ffebee;
      color: #c62828;
    }
    .retry-btn {
      margin-top: 10px;
      background: #c62828;
      color: white;
      border: 0;
      padding: 8px 18px;
      border-radius: var(--radius-control);
      cursor: pointer;
    }
    .empty-notice h3 {
      font-family: Georgia, serif;
      font-size: 1.5rem;
      margin: 0 0 8px;
    }
    .empty-notice p {
      color: var(--color-muted);
      margin-bottom: 20px;
    }
    .skeleton-grid .skeleton-card {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .skeleton-image {
      aspect-ratio: 3/4;
      background: #e8e4dc;
      border-radius: var(--radius-control);
      animation: pulse 1.5s infinite;
    }
    .skeleton-text {
      height: 16px;
      width: 80%;
      background: #e8e4dc;
      border-radius: var(--radius-control);
      animation: pulse 1.5s infinite;
    }
    .skeleton-sub {
      height: 14px;
      width: 40%;
      background: #e8e4dc;
      border-radius: var(--radius-control);
      animation: pulse 1.5s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 0.6; }
      50% { opacity: 1; }
    }
    .pagination-bar {
      margin-top: 60px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 20px;
    }
    .page-btn {
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      padding: 10px 20px;
      border-radius: var(--radius-control);
      cursor: pointer;
      font-size: 0.88rem;
    }
    .page-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    .page-info {
      font-size: 0.9rem;
      color: var(--color-muted);
    }

    .hero-section { background:linear-gradient(120deg,#eee7de,#f7f3ed); padding:clamp(48px,7vw,96px) max(6vw,calc((100vw - 1240px)/2)); border-bottom:1px solid var(--color-border); }
    .hero-title { letter-spacing:-.035em; } .eyebrow,.section-tag { color:var(--color-accent); letter-spacing:.18em; }
    .hero-subtitle { max-width:560px; }
    .search-box { border-radius:var(--radius-control); min-width:0; width:340px; max-width:100%; }
    .search-box input { min-width:0; width:100%; } .search-box button { min-height:44px; min-width:44px; }
    .search-box:focus-within { outline:2px solid var(--color-accent); outline-offset:3px; }
    .product-grid { grid-template-columns:repeat(auto-fill,minmax(min(240px,100%),1fr)); }
    .product-thumbnail { border-radius:var(--radius-card); }
    .product-name { line-height:1.55; } .product-price { font-variant-numeric:tabular-nums; }
    .product-card:focus-visible .hover-prompt { opacity:1; transform:none; }
    .pagination-bar { flex-wrap:wrap; gap:12px; }
    @media (hover:none) { .hover-prompt { opacity:1; transform:none; } }
    @media (max-width:600px) { .catalog-container { padding:36px 20px; } .hero-actions { gap:10px; } .search-box { width:100%; } .filter-controls { gap:16px; margin-bottom:24px; } }

    /* MUSE catalog */
    :host { display: block; background: #fff; color: #171717; }
    .hero-section {
      padding: 52px max(48px, calc((100vw - 1280px) / 2 + 48px));
      border: 0;
      border-bottom: 1px solid #dedede;
      background: #f7f3f2;
      background-image: none;
    }
    .hero-content { max-width: 680px; }
    .eyebrow,
    .section-tag {
      color: #a34e67;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 1.8px;
    }
    .hero-title {
      margin: 10px 0 14px;
      color: #171717;
      font-family: Georgia, "Times New Roman", serif;
      font-size: clamp(2.4rem, 4.2vw, 3.7rem);
      font-weight: 400;
      line-height: 1.08;
    }
    .hero-title em { color: #a34e67; font-weight: 400; }
    .hero-subtitle {
      max-width: 600px;
      margin: 0 0 24px;
      color: #5f5f5f;
      font-size: 15px;
      line-height: 1.65;
    }
    .hero-actions a {
      min-height: 44px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 11px 20px;
      border: 1px solid #171717;
      border-radius: 0;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.8px;
      text-transform: uppercase;
    }
    .hero-actions .btn-outline { background: transparent; color: #171717; }
    .hero-actions .btn-primary { background: #171717; color: #fff; }
    .catalog-container {
      width: 100%;
      max-width: 1280px;
      margin: 0 auto;
      padding: 52px 48px 72px;
    }
    .catalog-header {
      align-items: end;
      margin-bottom: 34px;
    }
    .section-title {
      margin: 5px 0 0;
      color: #171717;
      font-family: Georgia, "Times New Roman", serif;
      font-size: clamp(2.2rem, 3.5vw, 3rem);
      font-weight: 400;
      line-height: 1.1;
      letter-spacing: -0.035em;
    }
    .total-count {
      color: #5f5f5f;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.7px;
      text-transform: uppercase;
    }
    .category-row {
      margin-bottom: 24px;
      border-top: 1px solid #d7d7d7;
      border-bottom: 1px solid #d7d7d7;
    }
    .category-pills {
      display: flex;
      align-items: stretch;
      gap: 34px;
      min-height: 64px;
      flex-wrap: wrap;
    }
    .pill-btn {
      position: relative;
      min-height: 64px;
      padding: 0;
      border: 0;
      border-radius: 0;
      background: transparent;
      color: #444;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.7px;
      text-transform: uppercase;
    }
    .pill-btn:hover { background: transparent; color: #000; }
    .pill-btn.active { background: transparent; color: #000; }
    .pill-btn.active::after {
      content: '';
      position: absolute;
      right: 0;
      bottom: -1px;
      left: 0;
      height: 3px;
      background: #efb3bd;
    }
    .category-select {
      align-self: center;
      max-width: 220px;
      min-height: 42px;
      padding: 0 34px 0 12px;
      border: 1px solid #cfcfcf;
      border-radius: 0;
      background: #fff;
      color: #333;
      font-size: 12px;
      font-weight: 600;
    }
    .filter-controls {
      min-height: 72px;
      margin-bottom: 40px;
      padding: 13px 16px;
      border: 1px solid #d6d6d6;
      background: #fff;
      flex-wrap: nowrap;
    }
    .search-box {
      width: min(440px, 52vw);
      min-width: 260px;
      height: 44px;
      border: 1px solid #c8c8c8;
      border-radius: 0;
      background: #fff;
    }
    .search-box input {
      padding: 0 14px;
      color: #171717;
      font-size: 13px;
    }
    .search-box input::placeholder { color: #777; opacity: 1; }
    .search-box button {
      min-width: 44px;
      min-height: 42px;
      padding: 0;
      color: #171717;
    }
    .search-box:focus-within { outline: 2px solid #171717; outline-offset: 2px; }
    .sort-control {
      margin-left: auto;
      color: #555;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.65px;
      text-transform: uppercase;
    }
    .sort-control select {
      min-width: 190px;
      height: 44px;
      padding: 0 36px 0 14px;
      border: 1px solid #c8c8c8;
      border-radius: 0;
      background: #fff;
      color: #171717;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .product-grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 56px 24px;
    }
    .product-card { gap: 0; transform: none; }
    .product-card:hover { transform: none; }
    .product-thumbnail {
      aspect-ratio: 3 / 4;
      border-radius: 0;
      background: #eeeae5;
    }
    .product-thumbnail img { transition: transform 250ms ease; }
    .product-card:hover .product-thumbnail img { transform: scale(1.025); }
    .product-info {
      min-height: 70px;
      padding: 14px 0 12px;
      gap: 7px;
    }
    .product-name {
      color: #2f2f2f;
      font-size: 12px;
      font-weight: 700;
      line-height: 1.45;
      letter-spacing: 0.55px;
      text-transform: uppercase;
    }
    .product-price {
      color: #c75573;
      font-size: 14px;
      font-weight: 700;
    }
    .hover-prompt {
      position: static;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      width: 100%;
      min-height: 44px;
      padding: 10px 14px;
      border-radius: 0;
      background: #171717;
      color: #fff;
      opacity: 1;
      transform: none;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 1px;
    }
    .product-card:hover .hover-prompt { background: #efb3bd; color: #171717; opacity: 1; transform: none; }
    .product-card:focus-visible {
      outline: 2px solid #171717;
      outline-offset: 4px;
    }
    .state-notice {
      border: 1px solid #d5d5d5;
      border-radius: 0;
      background: #fafafa;
    }
    .error-notice { border-color: #d88787; background: #fff5f5; color: #a82121; }
    .retry-btn,
    .empty-notice .btn-primary {
      min-height: 42px;
      padding: 10px 20px;
      border: 1px solid #171717;
      border-radius: 0;
      background: #171717;
      color: #fff;
      font-weight: 700;
      cursor: pointer;
    }
    .skeleton-image,
    .skeleton-text,
    .skeleton-sub { border-radius: 0; }
    .pagination-bar {
      margin-top: 64px;
      padding-top: 32px;
      border-top: 1px solid #d7d7d7;
    }
    .page-btn {
      min-height: 42px;
      padding: 10px 18px;
      border: 1px solid #171717;
      border-radius: 0;
      background: #fff;
      color: #171717;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.45px;
      text-transform: uppercase;
    }
    .page-btn:hover:not(:disabled) { background: #171717; color: #fff; }
    .page-info { color: #555; font-size: 12px; }
    @media (max-width: 960px) {
      .catalog-container { padding-inline: 28px; }
      .product-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .filter-controls { align-items: stretch; flex-direction: column; }
      .search-box { width: 100%; min-width: 0; }
      .sort-control { width: 100%; margin-left: 0; justify-content: space-between; }
      .sort-control select { flex: 1; max-width: 260px; }
    }
    @media (max-width: 600px) {
      .hero-section { padding: 40px 20px; }
      .catalog-container { padding: 38px 20px 56px; }
      .catalog-header { align-items: flex-start; flex-direction: column; margin-bottom: 26px; }
      .category-pills { gap: 22px; min-height: 58px; flex-wrap: nowrap; overflow-x: auto; }
      .pill-btn { min-height: 58px; flex: 0 0 auto; }
      .category-select { flex: 0 0 auto; }
      .filter-controls { margin-bottom: 30px; }
      .sort-control { align-items: stretch; flex-direction: column; }
      .sort-control select { width: 100%; max-width: none; }
      .product-grid { grid-template-columns: 1fr; gap: 44px; }
      .product-thumbnail { aspect-ratio: 4 / 5; }
    }


  `],
})
export class CatalogPage implements OnInit, OnDestroy {
  private productsRequest?: Subscription;
  private categoriesRequest?: Subscription;
  ngOnDestroy(): void { this.productsRequest?.unsubscribe(); this.categoriesRequest?.unsubscribe(); }
  private readonly api = inject(ApiService);

  readonly products = signal<ProductSummary[]>([]);
  readonly categories = signal<Category[]>([]);
  readonly featuredCategories = computed(() => {
    const seen = new Set<string>();
    return this.categories().filter(cat => {
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
  page = signal<number>(1);
  limit = 12;
  total = signal<number>(0);

  totalPages = signal<number>(1);

  ngOnInit(): void {
    this.loadCategories();
    this.loadProducts();
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

    this.productsRequest = this.api.products({
      q: this.query,
      category: this.selectedCategory(),
      sort: this.sortOption,
      page: this.page(),
      limit: this.limit,
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

  search(): void {
    this.page.set(1);
    this.loadProducts();
  }

  selectCategory(slugOrId: string): void {
    this.selectedCategory.set(slugOrId);
    this.page.set(1);
    this.loadProducts();
  }

  changePage(newPage: number): void {
    if (newPage < 1 || newPage > this.totalPages()) return;
    this.page.set(newPage);
    this.loadProducts();
    window.scrollTo({ top: 300, behavior: 'smooth' });
  }

  resetFilters(): void {
    this.query = '';
    this.selectedCategory.set('');
    this.sortOption = '';
    this.page.set(1);
    this.loadProducts();
  }
}
