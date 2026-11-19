import { Component, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink, Router } from '@angular/router';
import { CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { ProductSummary } from '@fashion/contracts';
import { CartService } from '../services/cart.service';
import { AuthService } from '../services/auth.service';
import { ApiService } from '../services/api.service';
import { STORE_CART_CONTENT } from '../shared/store-content';
import { PageStateComponent } from '../components/page-state.component';

type CartRecommendation = ProductSummary & {
  createdAt?: string;
  salePrice?: number;
  discountPercent?: number;
};

@Component({
  standalone: true,
  imports: [PageStateComponent, RouterLink, CurrencyPipe, FormsModule],
  template: `
    <main class="cart-container">
      <header class="page-header">
        <h1 class="page-title">Giỏ hàng của bạn</h1>
      </header>

      @if (cart.loading() && !cart.cart()) {
        <fc-page-state kind="loading" title="Đang tải giỏ hàng" message="Vui lòng chờ trong giây lát." />
      } @else if (!cart.cart()) {
        <fc-page-state kind="error" title="Không thể tải giỏ hàng" message="Đã có lỗi xảy ra khi tải dữ liệu giỏ hàng." actionLabel="THỬ LẠI" (action)="reloadCart()" />
      } @else {
        <div class="cart-layout">
          <section class="cart-items-col" aria-label="Sản phẩm trong giỏ hàng">
            <div class="batch-controls">
              <label class="select-all-control">
                <input type="checkbox" [checked]="allSelected()" [disabled]="cart.cart()!.items.length === 0 || removing()" (change)="toggleAll($any($event.target).checked)" aria-label="Chọn tất cả sản phẩm" />
                <span>CHỌN TẤT CẢ</span>
              </label>
              <div class="batch-actions">
                <button type="button" class="batch-remove" [disabled]="cart.loading() || removing() || selectedVariantIds().size === 0" (click)="removeSelected()">Xóa đã chọn</button>
                <button type="button" class="clear-cart" [disabled]="cart.loading() || removing()" (click)="cart.clearCart()">Xóa toàn bộ</button>
              </div>
            </div>

            <div class="cart-items-list">
              @if (cart.cart()!.items.length === 0) {
                <fc-page-state kind="empty" title="Giỏ hàng của bạn đang trống" message="Khám phá các sản phẩm của MUSE và chọn thiết kế phù hợp với bạn." actionLabel="KHÁM PHÁ SẢN PHẨM" actionLink="/products" />
              } @else {
                @for (item of cart.cart()!.items; track item.variantId) {
                  <article class="cart-item">
                  <label class="item-select">
                    <input type="checkbox" [checked]="selectedVariantIds().has(item.variantId)" [disabled]="removing()" (change)="toggleItem(item.variantId, $any($event.target).checked)" [attr.aria-label]="'Chọn ' + item.productName" />
                  </label>

                  <div class="item-image">
                    @if ($any(item).imageUrl || $any(item).image) {
                      <img [src]="$any(item).imageUrl || $any(item).image" [alt]="item.productName" />
                    } @else {
                      <span>MUSE</span>
                    }
                  </div>

                  <div class="item-content">
                    @if (item.sku) {
                      <span class="item-kicker">{{ item.sku }}</span>
                    }
                    <h2>{{ item.productName }}</h2>
                    <p class="item-unit-price">{{ item.unitPrice | currency:'VND':'symbol':'1.0-0' }}</p>
                    <div class="item-attributes">
                      @if ($any(item).color) {
                        <span>Màu: {{ $any(item).color }}</span>
                      }
                      @if ($any(item).size) {
                        <span>Size: {{ $any(item).size }}</span>
                      }
                      @if (item.available !== undefined) {
                        <span class="stock-note" [class.stock-note--low]="item.available < 5">Kho: Còn {{ item.available }} chiếc</span>
                      }
                    </div>
                  </div>

                  <div class="item-purchase">
                    <strong>{{ (item.unitPrice * item.quantity) | currency:'VND':'symbol':'1.0-0' }}</strong>
                    <div class="qty-and-remove">
                      <div class="qty-stepper" aria-label="Số lượng sản phẩm">
                        <button type="button" (click)="cart.updateQuantity(item.variantId, item.quantity - 1)" [disabled]="cart.loading() || removing() || item.quantity <= 1" aria-label="Giảm số lượng">−</button>
                        <span>{{ item.quantity }}</span>
                        <button type="button" (click)="cart.updateQuantity(item.variantId, item.quantity + 1)" [disabled]="cart.loading() || removing() || item.quantity >= item.available" aria-label="Tăng số lượng">+</button>
                      </div>
                      <button type="button" class="item-remove" (click)="cart.removeItem(item.variantId)" [disabled]="cart.loading() || removing()" [attr.aria-label]="'Xóa ' + item.productName">Xóa</button>
                    </div>
                  </div>
                  </article>
                }
              }
            </div>

            <div class="continue-row">
              <a routerLink="/" class="continue-link"><span aria-hidden="true">←</span> TIẾP TỤC MUA SẮM</a>
              <p>{{ storeContent.deliveryNote }}</p>
            </div>
          </section>

          <aside class="summary-card" aria-labelledby="summary-title">
            <h2 id="summary-title">Tóm tắt đơn hàng</h2>
            <div class="voucher-block">
              <label for="cart-voucher">MÃ ƯU ĐÃI / VOUCHER</label>
              <div class="voucher-control">
                <input id="cart-voucher" type="text" placeholder="Nhập tại bước thanh toán" readonly data-ui-only />
                @if (selectedItems().length > 0) {
                  <a routerLink="/checkout" [queryParams]="checkoutQueryParams()">ÁP DỤNG</a>
                } @else {
                  <button type="button" disabled>ÁP DỤNG</button>
                }
              </div>
            </div>

            <div class="summary-lines">
              <div class="summary-line"><span>Tạm tính ({{ selectedItems().length }} sản phẩm):</span><strong>{{ selectedSubtotal() | currency:'VND':'symbol':'1.0-0' }}</strong></div>
              @if (cart.cart()!.items.length > 0) {
                <div class="summary-line"><span>Phí vận chuyển:</span><span>Tính tại thanh toán</span></div>
                <div class="summary-line"><span>Giảm giá voucher:</span><span>Nhập tại thanh toán</span></div>
              }
              <div class="summary-total">
                <span>TỔNG THANH TOÁN:</span>
                <strong>{{ selectedSubtotal() | currency:'VND':'symbol':'1.0-0' }}</strong>
              </div>
            </div>
            @if (cart.cart()!.items.length > 0 && selectedItems().length === 0) {
              <p class="select-hint" role="status">Tick chọn sản phẩm muốn thanh toán.</p>
            }

            <button type="button" class="checkout-button" [disabled]="selectedItems().length === 0" (click)="goToCheckout()">TIẾN HÀNH THANH TOÁN</button>
            <ul class="assurance-list">
              @for (assurance of storeContent.assurances; track assurance) {
                <li><span aria-hidden="true">✓</span>{{ assurance }}</li>
              }
            </ul>
          </aside>
        </div>

        <section class="recommendations" aria-labelledby="recommendations-title">
          <div class="recommendations-header">
            <div>
              <span>GỢI Ý HOÀN THIỆN PHONG CÁCH</span>
              <h2 id="recommendations-title">Có Thể Bạn Cũng Thích</h2>
            </div>
            <a routerLink="/products">XEM TẤT CẢ SẢN PHẨM</a>
          </div>

          @if (recommendationsLoading()) {
            <p class="recommendations-state">Đang tải sản phẩm gợi ý...</p>
          } @else if (recommendationsError()) {
            <p class="recommendations-state recommendations-state--error">{{ recommendationsError() }}</p>
          } @else if (recommendations().length > 0) {
            <div class="recommendation-grid">
              @for (item of recommendations(); track item.id) {
                <article class="recommendation-card">
                  <a class="recommendation-image" [routerLink]="['/products', item.slug]">
                    @if (item.images && item.images.length > 0) {
                      <img [src]="item.images[0]" [alt]="item.name" loading="lazy" />
                    } @else {
                      <span>MUSE</span>
                    }
                    @if (isNewProduct(item)) {
                      <small>MỚI</small>
                    }
                    @if (item.discountPercent !== undefined && item.discountPercent > 0) {
                      <small class="sale-badge">SALE -{{ item.discountPercent }}%</small>
                    }
                  </a>
                  <h3>{{ item.name }}</h3>
                  @if (item.salePrice !== undefined && item.salePrice < item.price) {
                    <p class="recommendation-price recommendation-price--sale"><strong>{{ item.salePrice | currency:'VND':'symbol':'1.0-0' }}</strong><s>{{ item.price | currency:'VND':'symbol':'1.0-0' }}</s></p>
                  } @else {
                    <p class="recommendation-price">{{ item.price | currency:'VND':'symbol':'1.0-0' }}</p>
                  }
                  <a class="buy-link" [routerLink]="['/products', item.slug]">MUA NGAY <span aria-hidden="true">→</span></a>
                </article>
              }
            </div>
          }
        </section>
      }
    </main>
  `,
  styles: [`
    @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&family=Playfair+Display:wght@400;500;600&display=swap');
    :host { display: block; background: #fff; color: #171717; font-family: "Montserrat", Arial, sans-serif; }
    button, input { font-family: "Montserrat", Arial, sans-serif; }
    .cart-container { width: min(100%, 1280px); margin: 0 auto; padding: 64px 48px; }
    .page-header { margin-bottom: 34px; padding-bottom: 16px; border-bottom: 1px solid #171717; }
    .page-title { margin: 0; font-family: "Playfair Display", Georgia, serif; font-size: 40px; font-weight: 400; line-height: 48px; letter-spacing: -1px; }
    .cart-layout { display: grid; grid-template-columns: minmax(0, 2.16fr) minmax(330px, 1fr); gap: 48px; align-items: start; }
    .cart-items-col { min-width: 0; }
    .batch-controls { display: flex; min-height: 44px; align-items: center; justify-content: space-between; gap: 20px; padding: 11px 16px; border-bottom: 1px solid #e3e2e2; background: #f5f3f3; }
    .select-all-control { display: inline-flex; align-items: center; gap: 12px; font-size: 13px; font-weight: 700; letter-spacing: .65px; cursor: pointer; }
    .select-all-control input, .item-select input { width: 18px; height: 18px; margin: 0; accent-color: #171717; cursor: pointer; }
    .select-all-control input:disabled { cursor: not-allowed; opacity: .4; }
    .batch-actions { display: flex; align-items: center; gap: 18px; }
    .batch-remove, .clear-cart { min-height: 28px; padding: 0; border: 0; background: transparent; color: #444748; font: inherit; font-size: 12px; cursor: pointer; text-decoration: underline; text-underline-offset: 4px; }
    .clear-cart { color: #9b2c2c; }
    .batch-remove:disabled, .clear-cart:disabled { opacity: .4; cursor: not-allowed; }
    .cart-items-list { border-bottom: 1px solid #c4c7c7; }
    .cart-item { display: grid; grid-template-columns: 18px 112px minmax(0, 1fr) 148px; gap: 20px; align-items: center; min-height: 208px; padding: 32px 0; border-bottom: 1px solid #e3e2e2; }
    .cart-item:last-child { border-bottom: 0; }
    .item-select { align-self: center; }
    .item-image { display: flex; width: 112px; height: 144px; align-items: center; justify-content: center; overflow: hidden; border: 1px solid #c4c7c7; background: #efeded; color: #8f485d; font-size: 11px; letter-spacing: .2em; }
    .item-image img { width: 100%; height: 100%; object-fit: cover; }
    .item-content { min-width: 0; align-self: stretch; padding-top: 3px; }
    .item-kicker { color: #8f485d; font-size: 10px; font-weight: 700; letter-spacing: 1.1px; text-transform: uppercase; }
    .item-content h2 { margin: 8px 0; font-family: "Playfair Display", Georgia, serif; font-size: 18px; font-weight: 400; line-height: 30px; }
    .item-unit-price { margin: 0; font-size: 14px; font-weight: 600; }
    .item-attributes { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-top: 24px; }
    .item-attributes > span { padding: 3px 8px; border: 1px solid #e3e2e2; background: #f5f3f3; color: #444748; font-size: 12px; }
    .item-attributes .stock-note { border: 0; background: transparent; color: #276749; }
    .item-attributes .stock-note--low { color: #9b2c2c; }
    .item-purchase { display: flex; align-items: flex-end; align-self: stretch; justify-content: center; flex-direction: column; gap: 28px; text-align: right; }
    .item-purchase > strong { font-size: 16px; letter-spacing: .7px; }
    .qty-and-remove { display: flex; align-items: center; gap: 12px; }
    .qty-stepper { display: inline-grid; grid-template-columns: 36px 42px 36px; align-items: center; height: 34px; border: 1px solid #171717; }
    .qty-stepper button { width: 36px; height: 32px; padding: 0; border: 0; background: #fff; color: #171717; font-size: 16px; cursor: pointer; }
    .qty-stepper button:disabled { opacity: .3; cursor: not-allowed; }
    .qty-stepper span { text-align: center; font-size: 13px; font-weight: 700; font-variant-numeric: tabular-nums; }
    .item-remove { min-height: 34px; padding: 0 2px; border: 0; border-bottom: 1px solid #444748; background: transparent; color: #444748; font-size: 11px; cursor: pointer; }
    .item-remove:hover { color: #9b2c2c; }
    .continue-row { display: flex; align-items: center; justify-content: space-between; gap: 24px; margin-top: 32px; padding-top: 16px; border-top: 1px solid #c4c7c7; }
    .continue-link { display: inline-flex; min-height: 42px; align-items: center; gap: 10px; padding: 0 24px; border: 1px solid #171717; background: #f4b8c1; color: #171717; font-size: 12px; font-weight: 700; letter-spacing: .65px; }
    .continue-row p { max-width: 360px; margin: 0; color: #444748; font-size: 12px; line-height: 1.5; text-align: right; }
    .summary-card { min-width: 0; padding: 32px; border: 1px solid #171717; background: #fff; }
    .summary-card h2 { margin: 0 0 24px; padding-bottom: 12px; border-bottom: 1px solid rgba(0,0,0,.2); font-family: "Playfair Display", Georgia, serif; font-size: 22px; font-weight: 500; line-height: 30px; letter-spacing: -.55px; }
    .voucher-block label { display: block; margin-bottom: 8px; color: #444748; font-size: 11px; font-weight: 700; letter-spacing: .55px; }
    .voucher-control { display: grid; grid-template-columns: minmax(0, 1fr) auto; height: 44px; border: 1px solid #171717; }
    .voucher-control input { min-width: 0; padding: 0 12px; border: 0; background: #fff; color: #444748; font: inherit; font-size: 12px; }
    .voucher-control a, .voucher-control button { display: flex; align-items: center; padding: 0 16px; border: 0; background: #171717; color: #fff; font: inherit; font-size: 11px; font-weight: 700; letter-spacing: .55px; }
    .voucher-control button:disabled { background: #747878; cursor: not-allowed; }
    .summary-lines { margin-top: 24px; padding-top: 8px; border-top: 1px solid rgba(196,199,199,.6); }
    .summary-line { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; margin: 14px 0; color: #444748; font-size: 13px; line-height: 1.45; }
    .summary-line > :last-child { color: #171717; text-align: right; }
    .summary-total { display: grid; gap: 10px; margin-top: 20px; padding-top: 18px; border-top: 1px solid rgba(0,0,0,.2); }
    .summary-total span { font-size: 14px; font-weight: 700; letter-spacing: .7px; }
    .summary-total strong { color: #c52929; font-family: "Playfair Display", Georgia, serif; font-size: 30px; font-weight: 600; line-height: 1.15; text-align: right; }
    .select-hint { margin: 16px 0 0; color: #8f485d; font-size: 12px; font-weight: 600; }
    .checkout-button { width: 100%; min-height: 50px; margin-top: 24px; border: 1px solid #171717; background: #f4b8c1; color: #171717; font-size: 12px; font-weight: 800; letter-spacing: 1.2px; cursor: pointer; }
    .checkout-button:hover { background: #171717; color: #fff; }
    .checkout-button:disabled { border-color: #c4c7c7; background: #efeded; color: #747878; cursor: not-allowed; }
    .checkout-button:disabled:hover { background: #efeded; color: #747878; }
    .assurance-list { display: grid; gap: 14px; margin: 28px 0 0; padding: 18px 0 0; border-top: 1px solid rgba(196,199,199,.6); list-style: none; }
    .assurance-list li { display: grid; grid-template-columns: 16px 1fr; gap: 9px; color: #444748; font-size: 12px; line-height: 1.5; }
    .assurance-list li span { color: #8f485d; font-weight: 800; }
    .recommendations { margin-top: 70px; padding-top: 48px; border-top: 1px solid #c4c7c7; }
    .recommendations-header { display: flex; align-items: end; justify-content: space-between; gap: 24px; margin-bottom: 32px; }
    .recommendations-header span { color: #8f485d; font-size: 11px; font-weight: 700; letter-spacing: 1.1px; }
    .recommendations-header h2 { margin: 8px 0 0; font-family: "Playfair Display", Georgia, serif; font-size: 28px; font-weight: 400; line-height: 36px; }
    .recommendations-header > a { color: #171717; font-size: 12px; font-weight: 700; letter-spacing: .65px; text-decoration: underline; text-underline-offset: 5px; }
    .recommendation-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 24px; }
    .recommendation-card { min-width: 0; }
    .recommendation-image { position: relative; display: flex; width: 100%; aspect-ratio: 3 / 4; align-items: center; justify-content: center; overflow: hidden; background: #efeded; color: #8f485d; font-size: 11px; letter-spacing: .2em; }
    .recommendation-image img { width: 100%; height: 100%; object-fit: cover; transition: transform .2s ease; }
    .recommendation-card:hover img { transform: scale(1.025); }
    .recommendation-image small { position: absolute; top: 8px; left: 8px; padding: 4px 8px; background: #fff; color: #171717; font-size: 10px; letter-spacing: .5px; }
    .recommendation-image .sale-badge { right: 8px; left: auto; background: #171717; color: #fff; }
    .recommendation-card h3 { min-height: 42px; margin: 12px 0 4px; font-size: 14px; font-weight: 500; line-height: 1.5; }
    .recommendation-price { min-height: 22px; margin: 0 0 14px; font-size: 14px; font-weight: 600; }
    .recommendation-price--sale { display: flex; align-items: center; gap: 10px; color: #c52929; }
    .recommendation-price--sale s { color: #747878; font-size: 12px; font-weight: 400; }
    .buy-link { display: flex; min-height: 40px; align-items: center; justify-content: center; gap: 8px; border: 1px solid #171717; border-radius: 15px; background: #171717; color: #fff; font-size: 12px; font-weight: 700; letter-spacing: 1.1px; }
    .buy-link:hover { background: #f4b8c1; color: #171717; }
    .recommendations-state { padding: 36px; border: 1px solid #e3e2e2; color: #444748; text-align: center; }
    .recommendations-state--error { color: #9b2c2c; }
    :is(button, a, input):focus-visible { outline: 2px solid #8f485d; outline-offset: 3px; }
    @media (max-width: 1000px) {
      .cart-container { padding-inline: 28px; }
      .cart-layout { grid-template-columns: 1fr; }
      .summary-card { width: 100%; }
      .recommendation-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 36px 20px; }
    }
    @media (max-width: 680px) {
      .cart-container { padding: 36px 18px 56px; }
      .batch-controls, .continue-row, .recommendations-header { align-items: flex-start; flex-direction: column; }
      .batch-actions { width: 100%; justify-content: space-between; }
      .cart-item { grid-template-columns: 18px 92px minmax(0, 1fr); gap: 14px; padding: 24px 0; }
      .item-image { width: 92px; height: 120px; }
      .item-purchase { grid-column: 2 / -1; align-items: stretch; gap: 14px; text-align: left; }
      .qty-and-remove { justify-content: space-between; }
      .item-attributes { margin-top: 14px; }
      .continue-row p { text-align: left; }
      .summary-card { padding: 24px 20px; }
      .recommendation-grid { grid-template-columns: 1fr; }
      .recommendations-header { align-items: flex-start; }
    }
  `],
})
export class CartPage implements OnInit {
  readonly cart = inject(CartService);
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly api = inject(ApiService);

  readonly storeContent = STORE_CART_CONTENT;
  readonly selectedVariantIds = signal<ReadonlySet<string>>(new Set());
  readonly recommendations = signal<CartRecommendation[]>([]);
  readonly recommendationsLoading = signal(true);
  readonly recommendationsError = signal('');
  /** Hàng đợi xóa lần lượt: món tiếp theo chỉ được xóa khi lần xóa trước đã xong. */
  private readonly removeQueue = signal<string[]>([]);
  readonly removing = computed(() => this.removeQueue().length > 0);
  private readonly removeQueueRunner = effect(() => {
    const queue = this.removeQueue();
    if (queue.length === 0 || this.cart.loading()) return;
    const [next, ...rest] = queue;
    untracked(() => {
      this.removeQueue.set(rest);
      this.cart.removeItem(next);
    });
  });
  /** Sản phẩm được tick: tổng tiền và thanh toán chỉ tính các sản phẩm này (chưa tick thì 0đ). */
  readonly selectedItems = computed(() => {
    const selected = this.selectedVariantIds();
    return (this.cart.cart()?.items ?? []).filter((item) => selected.has(item.variantId));
  });
  readonly selectedSubtotal = computed(() => this.selectedItems().reduce((sum, item) => sum + item.unitPrice * item.quantity, 0));
  readonly checkoutQueryParams = computed(() => ({ items: this.selectedItems().map((item) => item.variantId).join(',') }));
  readonly allSelected = computed(() => {
    const items = this.cart.cart()?.items ?? [];
    const selected = this.selectedVariantIds();
    return items.length > 0 && items.every((item) => selected.has(item.variantId));
  });

  ngOnInit(): void {
    this.api.products({ page: 1, limit: 4 }).subscribe({
      next: (response) => {
        this.recommendations.set(response.items as CartRecommendation[]);
        this.recommendationsLoading.set(false);
      },
      error: () => {
        this.recommendationsError.set('Không thể tải sản phẩm gợi ý.');
        this.recommendationsLoading.set(false);
      },
    });
  }

  toggleAll(checked: boolean): void {
    const items = this.cart.cart()?.items ?? [];
    this.selectedVariantIds.set(checked ? new Set(items.map((item) => item.variantId)) : new Set());
  }

  toggleItem(variantId: string, checked: boolean): void {
    const selected = new Set(this.selectedVariantIds());
    checked ? selected.add(variantId) : selected.delete(variantId);
    this.selectedVariantIds.set(selected);
  }

  removeSelected(): void {
    if (this.removing() || this.cart.loading()) return;
    const inCart = new Set((this.cart.cart()?.items ?? []).map((item) => item.variantId));
    const queue = [...this.selectedVariantIds()].filter((variantId) => inCart.has(variantId));
    this.selectedVariantIds.set(new Set());
    this.removeQueue.set(queue);
  }

  isNewProduct(product: CartRecommendation): boolean {
    if (!product.createdAt) return false;
    const createdAt = new Date(product.createdAt).getTime();
    return Number.isFinite(createdAt) && Date.now() - createdAt <= 30 * 24 * 60 * 60 * 1000;
  }

  reloadCart(): void {
    window.location.reload();
  }

  goToCheckout(): void {
    if (this.selectedItems().length === 0) return;
    const queryParams = this.checkoutQueryParams();
    if (!this.auth.isAuthenticated()) {
      this.router.navigate(['/auth'], { queryParams: { returnUrl: '/checkout?items=' + queryParams.items } });
      return;
    }
    this.router.navigate(['/checkout'], { queryParams });
  }
}
